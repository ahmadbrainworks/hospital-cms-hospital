import jwt from "jsonwebtoken";
import { getConfig } from "@hospital-cms/config";
import type { UserRole, Permission } from "@hospital-cms/shared-types";
import { TokenExpiredError, InvalidTokenError } from "@hospital-cms/errors";

// JWT ACCESS + REFRESH TOKENS
// Access tokens: short-lived (15m), stateless JWT.
// Refresh tokens: long-lived (7d), stored server-side for revocation.

export interface AccessTokenPayload {
  sub: string; // userId
  username: string;
  role: UserRole;
  permissions: Permission[];
  hospitalId: string;
  sessionId: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string; // userId
  sessionId: string;
  hospitalId: string;
  type: "refresh";
}

export function signAccessToken(
  payload: Omit<AccessTokenPayload, "type">,
): string {
  const cfg = getConfig();
  const expiresIn = cfg.JWT_EXPIRY as Exclude<
    jwt.SignOptions["expiresIn"],
    undefined
  >;
  return jwt.sign({ ...payload, type: "access" }, cfg.JWT_SECRET, {
    expiresIn,
    issuer: "hospital-cms",
    audience: payload.hospitalId,
  });
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, "type">,
): string {
  const cfg = getConfig();
  const expiresIn = cfg.REFRESH_TOKEN_EXPIRY as Exclude<
    jwt.SignOptions["expiresIn"],
    undefined
  >;
  return jwt.sign({ ...payload, type: "refresh" }, cfg.REFRESH_TOKEN_SECRET, {
    expiresIn,
    issuer: "hospital-cms",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const cfg = getConfig();
  try {
    const payload = jwt.verify(token, cfg.JWT_SECRET, {
      issuer: "hospital-cms",
    }) as AccessTokenPayload;

    if (payload.type !== "access") {
      throw new InvalidTokenError("Token type mismatch");
    }

    return payload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError();
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new InvalidTokenError();
    }
    throw err;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const cfg = getConfig();
  try {
    const payload = jwt.verify(token, cfg.REFRESH_TOKEN_SECRET, {
      issuer: "hospital-cms",
    }) as RefreshTokenPayload;

    if (payload.type !== "refresh") {
      throw new InvalidTokenError("Token type mismatch");
    }

    return payload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError();
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new InvalidTokenError();
    }
    throw err;
  }
}

export function decodeTokenWithoutVerification(
  token: string,
): jwt.JwtPayload | null {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded === "string") return null;
    return decoded;
  } catch {
    return null;
  }
}
