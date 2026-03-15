/**
 * Vendor JWT token service.
 *
 * Self-contained — does NOT use getConfig() from @hospital-cms/config
 * (that's for the client CMS). Secrets are passed in explicitly from
 * the control-panel config.
 */
import jwt, { type SignOptions } from "jsonwebtoken";
import { UnauthorizedError, InvalidTokenError } from "@hospital-cms/errors";
import type {
  VendorAccessTokenPayload,
  VendorRefreshTokenPayload,
} from "../types/vendor-auth";

const ISSUER = "hospital-cms-vendor";

export function signVendorAccessToken(
  payload: Omit<VendorAccessTokenPayload, "type">,
  secret: string,
  expiry: string,
): string {
  const opts: SignOptions = {
    expiresIn: expiry as unknown as SignOptions["expiresIn"],
    issuer: ISSUER,
  };
  return jwt.sign({ ...payload, type: "vendor_access" }, secret, opts);
}

export function signVendorRefreshToken(
  payload: Omit<VendorRefreshTokenPayload, "type">,
  secret: string,
  expiry: string,
): string {
  const opts: SignOptions = {
    expiresIn: expiry as unknown as SignOptions["expiresIn"],
    issuer: ISSUER,
  };
  return jwt.sign({ ...payload, type: "vendor_refresh" }, secret, opts);
}

export function verifyVendorAccessToken(
  token: string,
  secret: string,
): VendorAccessTokenPayload {
  try {
    const decoded = jwt.verify(token, secret, { issuer: ISSUER }) as Record<
      string,
      unknown
    >;
    if (decoded["type"] !== "vendor_access") {
      throw new InvalidTokenError("Not a vendor access token");
    }
    return decoded as unknown as VendorAccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Token expired");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError("Invalid token");
    }
    throw err;
  }
}

export function verifyVendorRefreshToken(
  token: string,
  secret: string,
): VendorRefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, secret, { issuer: ISSUER }) as Record<
      string,
      unknown
    >;
    if (decoded["type"] !== "vendor_refresh") {
      throw new InvalidTokenError("Not a vendor refresh token");
    }
    return decoded as unknown as VendorRefreshTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Refresh token expired");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError("Invalid refresh token");
    }
    throw err;
  }
}
