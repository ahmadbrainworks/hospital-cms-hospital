/**
 * Staff JWT authentication middleware for vendor control panel.
 *
 * requireStaffAuth — extracts and verifies the Bearer token from the
 * Authorization header, attaches the decoded staff context to req.staffContext.
 *
 * requireVendorAuthOrStaff — dual-mode: tries JWT first, falls back to
 * HMAC vendor auth. This allows existing HMAC-based agent/tool integrations
 * to keep working while the dashboard uses JWT.
 */
import { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "@hospital-cms/errors";
import { getControlPanelConfig } from "@hospital-cms/config";
import { verifyVendorAccessToken } from "../auth/vendor-tokens";
import { requireVendorApiKey } from "./vendor-auth";
import type { VendorStaffContext } from "../types/vendor-auth";

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      staffContext?: VendorStaffContext;
    }
  }
}

/**
 * Require a valid vendor staff JWT in the Authorization header.
 * On success, populates req.staffContext.
 */
export function requireStaffAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(new UnauthorizedError("Missing or invalid Authorization header"));
    return;
  }

  const token = authHeader.slice(7);
  try {
    const config = getControlPanelConfig();
    const payload = verifyVendorAccessToken(token, config.CP_JWT_SECRET);

    req.staffContext = {
      staffId: payload.sub,
      email: payload.email,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      permissions: payload.permissions,
      sessionId: payload.sessionId,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Dual-mode auth: tries staff JWT first, falls back to HMAC vendor auth.
 * Keeps backward compatibility with existing HMAC-signed requests
 * (agent heartbeats, CLI tools, etc.) while letting the dashboard use JWT.
 */
export function requireVendorAuthOrStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  // If Authorization: Bearer ... is present, try JWT
  if (authHeader && authHeader.startsWith("Bearer ")) {
    requireStaffAuth(req, res, next);
    return;
  }

  // Otherwise fall back to HMAC vendor auth
  requireVendorApiKey(req, res, next);
}
