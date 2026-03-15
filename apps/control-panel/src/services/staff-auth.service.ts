/**
 * Staff authentication service.
 *
 * Handles login (credential validation, lockout, token issuance),
 * token refresh with rotation, logout (session revocation),
 * and profile retrieval.
 */
import { Db } from "mongodb";
import { createLogger } from "@hospital-cms/logger";
import { UnauthorizedError } from "@hospital-cms/errors";
import { getControlPanelConfig } from "@hospital-cms/config";
import { getVendorRolePermissions } from "../auth/vendor-role-permissions";
import {
  signVendorAccessToken,
  signVendorRefreshToken,
  verifyVendorRefreshToken,
} from "../auth/vendor-tokens";
import {
  StaffSessionStore,
  hashRefreshToken,
} from "../auth/staff-session-store";
import { StaffService } from "./staff.service";
import { StaffAuditService } from "./staff-audit.service";
import { VendorStaffStatus, type StaffPublic } from "../types/vendor-auth";

const logger = createLogger({ module: "StaffAuthService" });

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface LoginResult {
  staff: StaffPublic;
  tokens: TokenPair;
  sessionId: string;
}

export class StaffAuthService {
  private readonly staffService: StaffService;
  private readonly sessionStore: StaffSessionStore;
  private readonly audit: StaffAuditService;

  constructor(private readonly db: Db) {
    this.staffService = new StaffService(db);
    this.sessionStore = new StaffSessionStore(db);
    this.audit = new StaffAuditService(db);
  }

  async login(params: {
    email: string;
    password: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<LoginResult> {
    const { email, password, ipAddress, userAgent } = params;

    // Fetch full document (with passwordHash)
    const staff = await this.staffService._getStaffByEmail(email);
    if (!staff) {
      logger.warn({ email }, "Login attempt for unknown email");
      this.audit.log("unknown", email, "auth.login_failed", { reason: "unknown_email" }, ipAddress);
      throw new UnauthorizedError("Invalid email or password");
    }

    // Check status before password verification
    if (staff.status === VendorStaffStatus.LOCKED) {
      logger.warn({ staffId: staff.staffId }, "Login attempt on locked account");
      this.audit.log(staff.staffId, staff.email, "auth.login_failed", { reason: "account_locked" }, ipAddress);
      throw new UnauthorizedError("Account is locked. Contact an administrator.");
    }

    if (staff.status === VendorStaffStatus.DISABLED) {
      logger.warn({ staffId: staff.staffId }, "Login attempt on disabled account");
      this.audit.log(staff.staffId, staff.email, "auth.login_failed", { reason: "account_disabled" }, ipAddress);
      throw new UnauthorizedError("Account is disabled. Contact an administrator.");
    }

    // Verify password
    const valid = await this.staffService.verifyPassword(staff.passwordHash, password);
    if (!valid) {
      await this.staffService.recordFailedLogin(email);
      this.audit.log(staff.staffId, staff.email, "auth.login_failed", { reason: "bad_password" }, ipAddress);
      throw new UnauthorizedError("Invalid email or password");
    }

    // Successful — issue tokens
    await this.staffService.recordSuccessfulLogin(staff.staffId, ipAddress);

    const config = getControlPanelConfig();
    const permissions = getVendorRolePermissions(staff.role);

    // Sign tokens
    const accessToken = signVendorAccessToken(
      {
        sub: staff.staffId,
        email: staff.email,
        username: staff.username,
        displayName: staff.displayName,
        role: staff.role,
        permissions,
        sessionId: "", // placeholder — filled after session creation
      },
      config.CP_JWT_SECRET,
      config.CP_JWT_EXPIRY,
    );

    const refreshToken = signVendorRefreshToken(
      { sub: staff.staffId, sessionId: "" },
      config.CP_REFRESH_TOKEN_SECRET,
      config.CP_REFRESH_TOKEN_EXPIRY,
    );

    // Parse expiry for session TTL
    const refreshExpiresAt = new Date(
      Date.now() + parseExpiry(config.CP_REFRESH_TOKEN_EXPIRY),
    );

    // Store session
    const sessionId = await this.sessionStore.createSession({
      staffId: staff.staffId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      ipAddress,
      userAgent,
      expiresAt: refreshExpiresAt,
    });

    // Re-sign tokens with the real sessionId
    const finalAccessToken = signVendorAccessToken(
      {
        sub: staff.staffId,
        email: staff.email,
        username: staff.username,
        displayName: staff.displayName,
        role: staff.role,
        permissions,
        sessionId,
      },
      config.CP_JWT_SECRET,
      config.CP_JWT_EXPIRY,
    );

    const finalRefreshToken = signVendorRefreshToken(
      { sub: staff.staffId, sessionId },
      config.CP_REFRESH_TOKEN_SECRET,
      config.CP_REFRESH_TOKEN_EXPIRY,
    );

    // Update the stored hash to match the final refresh token
    await this.sessionStore.rotateRefreshToken(
      sessionId,
      hashRefreshToken(finalRefreshToken),
    );

    logger.info({ staffId: staff.staffId, sessionId }, "Staff login successful");
    this.audit.log(staff.staffId, staff.email, "auth.login", { sessionId }, ipAddress);

    const { passwordHash: _pw, _id: _id, ...staffPublic } = staff;
    return {
      staff: staffPublic,
      tokens: {
        accessToken: finalAccessToken,
        refreshToken: finalRefreshToken,
        expiresIn: config.CP_JWT_EXPIRY,
      },
      sessionId,
    };
  }

  async refresh(params: {
    refreshToken: string;
    ipAddress: string;
  }): Promise<TokenPair> {
    const { refreshToken, ipAddress } = params;
    const config = getControlPanelConfig();

    // Verify the JWT signature and structure
    const payload = verifyVendorRefreshToken(refreshToken, config.CP_REFRESH_TOKEN_SECRET);

    // Validate against session store
    const session = await this.sessionStore.validateRefreshToken(
      payload.sessionId,
      hashRefreshToken(refreshToken),
    );

    if (!session) {
      logger.warn({ sessionId: payload.sessionId }, "Refresh token session invalid or revoked");
      throw new UnauthorizedError("Session expired or revoked");
    }

    // Look up current staff state (role may have changed)
    const staff = await this.staffService.getStaffById(session.staffId);
    const permissions = getVendorRolePermissions(staff.role);

    // Issue new token pair
    const newAccessToken = signVendorAccessToken(
      {
        sub: staff.staffId,
        email: staff.email,
        username: staff.username,
        displayName: staff.displayName,
        role: staff.role,
        permissions,
        sessionId: session.sessionId,
      },
      config.CP_JWT_SECRET,
      config.CP_JWT_EXPIRY,
    );

    const newRefreshToken = signVendorRefreshToken(
      { sub: staff.staffId, sessionId: session.sessionId },
      config.CP_REFRESH_TOKEN_SECRET,
      config.CP_REFRESH_TOKEN_EXPIRY,
    );

    // Rotate stored hash
    await this.sessionStore.rotateRefreshToken(
      session.sessionId,
      hashRefreshToken(newRefreshToken),
    );

    logger.debug({ staffId: staff.staffId, sessionId: session.sessionId }, "Token refreshed");
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: config.CP_JWT_EXPIRY,
    };
  }

  async logout(params: {
    sessionId: string;
    staffId: string;
    ipAddress: string;
  }): Promise<void> {
    await this.sessionStore.revokeSession(params.sessionId);
    logger.info({ staffId: params.staffId, sessionId: params.sessionId }, "Staff logged out");
    this.audit.log(params.staffId, "system", "auth.logout", { sessionId: params.sessionId }, params.ipAddress);
  }

  async logoutAll(params: {
    staffId: string;
    ipAddress: string;
  }): Promise<number> {
    const count = await this.sessionStore.revokeAllStaffSessions(params.staffId);
    this.audit.log(params.staffId, "system", "auth.logout_all", { revokedCount: count }, params.ipAddress);
    return count;
  }

  async getStaffProfile(staffId: string): Promise<StaffPublic> {
    return this.staffService.getStaffById(staffId);
  }
}

/**
 * Parse a duration string like "15m", "7d", "1h" into milliseconds.
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return 15 * 60 * 1000; // default 15m

  const value = parseInt(match[1]!, 10);
  switch (match[2]!) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 3600 * 1000;
    case "d": return value * 86400 * 1000;
    default: return 15 * 60 * 1000;
  }
}
