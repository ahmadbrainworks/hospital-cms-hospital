import { Db } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  SessionStore,
  generateTotpSecret,
  verifyTotpCode,
  buildOtpAuthUri,
} from "@hospital-cms/auth";
import { sha256, encryptAes256Gcm, decryptAes256Gcm } from "@hospital-cms/crypto";
import { UserRepository } from "@hospital-cms/database";
import { AuditService } from "@hospital-cms/audit";
import {
  InvalidCredentialsError,
  AccountLockedError,
  UnauthorizedError,
} from "@hospital-cms/errors";
import { AuditAction } from "@hospital-cms/shared-types";
import type { UserPublic } from "@hospital-cms/shared-types";
import { logger } from "@hospital-cms/logger";

// AUTH SERVICE
// Handles login, token refresh, logout, and password change.

const MAX_FAILED_ATTEMPTS = 5;
const log = logger("api:auth:service");

/**
 * AES-256-GCM helpers for TOTP secret encryption at rest.
 * Requires MFA_ENCRYPTION_KEY env var: 64 hex chars (32 bytes).
 * Format stored in DB: JSON stringified EncryptedData object.
 */
function getMfaEncryptionKey(): string {
  const key = process.env["MFA_ENCRYPTION_KEY"];
  if (!key || key.length !== 64) {
    throw new Error("MFA_ENCRYPTION_KEY must be set to a 64-char hex string (32 bytes)");
  }
  return key;
}

function encryptMfaSecret(secret: string): string {
  const enc = encryptAes256Gcm(secret, getMfaEncryptionKey());
  return JSON.stringify(enc);
}

function decryptMfaSecret(stored: string): string {
  const enc = JSON.parse(stored) as Parameters<typeof decryptAes256Gcm>[0];
  return decryptAes256Gcm(enc, getMfaEncryptionKey());
}

export type LoginResult =
  | { mfaRequired: true; mfaToken: string }
  | { mfaRequired: false; accessToken: string; refreshToken: string; user: UserPublic };

/** Short-lived token embedded in a signed access token with limited scope */
const MFA_PENDING_ROLE = "MFA_PENDING" as const;

export class AuthService {
  private readonly userRepo: UserRepository;
  private readonly sessionStore: SessionStore;
  private readonly auditService: AuditService;

  constructor(db: Db) {
    this.userRepo = new UserRepository(db);
    this.sessionStore = new SessionStore(db);
    this.auditService = new AuditService(db);
  }

  async login(params: {
    hospitalId: string;
    identifier: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
    traceId: string;
  }): Promise<LoginResult> {
    const { hospitalId, identifier, password, ipAddress, userAgent, traceId } =
      params;

    const user = await this.userRepo.findByEmailOrUsername(
      hospitalId,
      identifier,
    );

    if (!user) {
      // Perform dummy verification to prevent timing attacks
      await verifyPassword(
        password,
        "$2b$12$dummyhashtopreventtimingattack123456789",
      );
      throw new InvalidCredentialsError();
    }

    if (user.isLocked) {
      await this.auditService.log({
        hospitalId,
        traceId,
        action: AuditAction.AUTH_LOGIN_FAILED,
        actor: { userId: user._id, username: user.username, role: user.role },
        resource: { type: "User", id: user._id },
        outcome: "FAILURE",
        failureReason: "Account locked",
        ipAddress,
        userAgent,
      });
      throw new AccountLockedError(
        user.lockReason ?? "Account is locked. Contact your administrator.",
      );
    }

    if (!user.isActive) {
      throw new InvalidCredentialsError();
    }

    // Progressive lockout — exponential backoff after MAX_FAILED_ATTEMPTS
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS && user.lastFailedLoginAt) {
      const lockDurationSec = Math.min(
        30 * Math.pow(2, user.failedLoginAttempts - MAX_FAILED_ATTEMPTS),
        1800, // max 30 minutes
      );
      const lastFailed = user.lastFailedLoginAt instanceof Date
        ? user.lastFailedLoginAt.getTime()
        : new Date(user.lastFailedLoginAt).getTime();
      const elapsed = Date.now() - lastFailed;

      if (elapsed < lockDurationSec * 1000) {
        const remainingSec = Math.ceil((lockDurationSec * 1000 - elapsed) / 1000);
        log.warn(
          { userId: user._id, failedAttempts: user.failedLoginAttempts, lockDurationSec, remainingSec },
          "Login rejected — progressive lockout active",
        );
        await this.auditService.log({
          hospitalId,
          traceId,
          action: AuditAction.AUTH_LOGIN_FAILED,
          actor: { userId: user._id, username: user.username, role: user.role },
          resource: { type: "User", id: user._id },
          outcome: "FAILURE",
          failureReason: `Progressive lockout: ${remainingSec}s remaining`,
          ipAddress,
          userAgent,
        });
        throw new AccountLockedError(
          `Too many failed attempts. Try again in ${remainingSec} seconds.`,
        );
      }
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);

    if (!passwordValid) {
      await this.userRepo.incrementFailedAttempts(user._id);

      await this.auditService.log({
        hospitalId,
        traceId,
        action: AuditAction.AUTH_LOGIN_FAILED,
        actor: { userId: user._id, username: user.username, role: user.role },
        resource: { type: "User", id: user._id },
        outcome: "FAILURE",
        failureReason: "Invalid password",
        ipAddress,
        userAgent,
      });

      throw new InvalidCredentialsError();
    }

    // Success path
    await this.userRepo.resetFailedAttempts(user._id);

    // MFA check — if enabled, issue a short-lived mfaToken instead of full session
    if (user.mfaEnabled && user.mfaSecret) {
      // Sign a limited-scope token that only allows POST /auth/mfa/complete
      const mfaToken = signAccessToken({
        sub: user._id,
        username: user.username,
        role: MFA_PENDING_ROLE as any,
        permissions: [],
        hospitalId,
        sessionId: "mfa-pending",
      });
      return { mfaRequired: true, mfaToken };
    }

    const sessionId = await this.sessionStore.createSession({
      userId: user._id,
      hospitalId,
      role: user.role,
      refreshTokenHash: "",
      ipAddress,
      userAgent,
    });

    const accessToken = signAccessToken({
      sub: user._id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      hospitalId,
      sessionId,
    });

    const refreshToken = signRefreshToken({
      sub: user._id,
      sessionId,
      hospitalId,
    });

    // Store hashed refresh token
    const refreshTokenHash = sha256(refreshToken);
    await this.sessionStore.revokeSession(sessionId);
    await this.sessionStore.createSession({
      userId: user._id,
      hospitalId,
      role: user.role,
      refreshTokenHash,
      ipAddress,
      userAgent,
    });

    await this.auditService.log({
      hospitalId,
      traceId,
      action: AuditAction.AUTH_LOGIN,
      actor: { userId: user._id, username: user.username, role: user.role },
      resource: { type: "User", id: user._id },
      outcome: "SUCCESS",
      ipAddress,
      userAgent,
      sessionId,
    });

    const { passwordHash, mfaSecret, ...userPublic } = user;
    return {
      mfaRequired: false,
      accessToken,
      refreshToken,
      user: userPublic as UserPublic,
    };
  }

  /** Complete MFA login — verify TOTP code, then issue full session tokens */
  async completeMfaLogin(params: {
    hospitalId: string;
    userId: string;
    totpCode: string;
    ipAddress?: string;
    userAgent?: string;
    traceId: string;
  }): Promise<{ accessToken: string; refreshToken: string; user: UserPublic }> {
    const { hospitalId, userId, totpCode, ipAddress, userAgent, traceId } = params;
    const user = await this.userRepo.findByIdOrThrow(userId);

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedError("MFA not configured for this account");
    }

    const decryptedSecret = decryptMfaSecret(user.mfaSecret);
    if (!verifyTotpCode(decryptedSecret, totpCode)) {
      await this.auditService.log({
        hospitalId,
        traceId,
        action: AuditAction.AUTH_LOGIN_FAILED,
        actor: { userId: user._id, username: user.username, role: user.role },
        resource: { type: "User", id: user._id },
        outcome: "FAILURE",
        failureReason: "Invalid TOTP code",
        ipAddress,
        userAgent,
      });
      throw new InvalidCredentialsError("Invalid authenticator code");
    }

    const sessionId = await this.sessionStore.createSession({
      userId: user._id,
      hospitalId,
      role: user.role,
      refreshTokenHash: "",
      ipAddress,
      userAgent,
    });

    const accessToken = signAccessToken({
      sub: user._id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      hospitalId,
      sessionId,
    });

    const refreshToken = signRefreshToken({
      sub: user._id,
      sessionId,
      hospitalId,
    });

    const refreshTokenHash = sha256(refreshToken);
    await this.sessionStore.revokeSession(sessionId);
    const finalSessionId = await this.sessionStore.createSession({
      userId: user._id,
      hospitalId,
      role: user.role,
      refreshTokenHash,
      ipAddress,
      userAgent,
    });

    await this.auditService.log({
      hospitalId,
      traceId,
      action: AuditAction.AUTH_LOGIN,
      actor: { userId: user._id, username: user.username, role: user.role },
      resource: { type: "User", id: user._id },
      outcome: "SUCCESS",
      ipAddress,
      userAgent,
      sessionId: finalSessionId,
    });

    const { passwordHash, mfaSecret, ...userPublic } = user;
    return { accessToken, refreshToken, user: userPublic as UserPublic };
  }

  /** Begin MFA enrollment — generate secret and return otpauth URI */
  async setupMfa(userId: string): Promise<{ secret: string; otpAuthUri: string }> {
    const user = await this.userRepo.findByIdOrThrow(userId);
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri(secret, user.email ?? user.username);
    // Store unconfirmed secret encrypted — not enabled until verify
    await this.userRepo.updateById(userId, { mfaSecret: encryptMfaSecret(secret) } as any);
    return { secret, otpAuthUri: uri };
  }

  /** Confirm MFA enrollment by verifying the first code */
  async verifyMfaSetup(userId: string, totpCode: string): Promise<void> {
    const user = await this.userRepo.findByIdOrThrow(userId);
    if (!user.mfaSecret) {
      throw new UnauthorizedError("Run MFA setup first");
    }
    if (!verifyTotpCode(decryptMfaSecret(user.mfaSecret), totpCode)) {
      throw new InvalidCredentialsError("Invalid authenticator code");
    }
    await this.userRepo.updateById(userId, { mfaEnabled: true } as any);
  }

  /** Disable MFA — requires current TOTP code */
  async disableMfa(userId: string, totpCode: string): Promise<void> {
    const user = await this.userRepo.findByIdOrThrow(userId);
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedError("MFA is not enabled");
    }
    if (!verifyTotpCode(decryptMfaSecret(user.mfaSecret), totpCode)) {
      throw new InvalidCredentialsError("Invalid authenticator code");
    }
    await this.userRepo.updateById(userId, {
      mfaEnabled: false,
      mfaSecret: undefined,
    } as any);
  }

  async refresh(params: {
    refreshToken: string;
    ipAddress?: string;
    traceId: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const { refreshToken, traceId } = params;

    const payload = verifyRefreshToken(refreshToken);
    const refreshTokenHash = sha256(refreshToken);

    const session = await this.sessionStore.validateRefreshToken(
      payload.sessionId,
      refreshTokenHash,
    );

    if (!session) {
      throw new UnauthorizedError("Session invalid or expired");
    }

    const user = await this.userRepo.findByIdOrThrow(payload.sub);

    if (!user.isActive || user.isLocked) {
      await this.sessionStore.revokeSession(payload.sessionId);
      throw new UnauthorizedError("Account is not active");
    }

    // Rotate: revoke old session, issue new tokens
    await this.sessionStore.revokeSession(payload.sessionId);

    const newSessionId = await this.sessionStore.createSession({
      userId: user._id,
      hospitalId: payload.hospitalId,
      role: user.role,
      refreshTokenHash: "",
      ipAddress: params.ipAddress,
    });

    const newAccessToken = signAccessToken({
      sub: user._id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      hospitalId: payload.hospitalId,
      sessionId: newSessionId,
    });

    const newRefreshToken = signRefreshToken({
      sub: user._id,
      sessionId: newSessionId,
      hospitalId: payload.hospitalId,
    });

    const newHash = sha256(newRefreshToken);
    await this.sessionStore.revokeSession(newSessionId);
    await this.sessionStore.createSession({
      userId: user._id,
      hospitalId: payload.hospitalId,
      role: user.role,
      refreshTokenHash: newHash,
      ipAddress: params.ipAddress,
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(params: {
    sessionId: string;
    userId: string;
    hospitalId: string;
    traceId: string;
    ipAddress?: string;
    userAgent?: string;
    username: string;
    role: import("@hospital-cms/shared-types").UserRole;
  }): Promise<void> {
    await this.sessionStore.revokeSession(params.sessionId);

    await this.auditService.log({
      hospitalId: params.hospitalId,
      traceId: params.traceId,
      action: AuditAction.AUTH_LOGOUT,
      actor: {
        userId: params.userId,
        username: params.username,
        role: params.role,
        sessionId: params.sessionId,
      },
      resource: { type: "User", id: params.userId },
      outcome: "SUCCESS",
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      sessionId: params.sessionId,
    });
  }

  async changePassword(params: {
    userId: string;
    hospitalId: string;
    currentPassword: string;
    newPassword: string;
    traceId: string;
    ipAddress?: string;
  }): Promise<void> {
    const user = await this.userRepo.findByIdOrThrow(params.userId);

    const valid = await verifyPassword(
      params.currentPassword,
      user.passwordHash,
    );
    if (!valid) {
      throw new InvalidCredentialsError("Current password is incorrect");
    }

    const newHash = await hashPassword(params.newPassword);
    await this.userRepo.updateById(params.userId, {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
    } as Partial<import("@hospital-cms/shared-types").User>);

    // Revoke all sessions to force re-login
    await this.sessionStore.revokeAllUserSessions(params.userId);

    await this.auditService.log({
      hospitalId: params.hospitalId,
      traceId: params.traceId,
      action: AuditAction.AUTH_PASSWORD_CHANGED,
      actor: { userId: user._id, username: user.username, role: user.role },
      resource: { type: "User", id: user._id },
      outcome: "SUCCESS",
      ipAddress: params.ipAddress,
    });
  }
}
