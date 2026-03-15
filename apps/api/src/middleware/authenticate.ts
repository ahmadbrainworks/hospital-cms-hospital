import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "@hospital-cms/auth";
import { UnauthorizedError } from "@hospital-cms/errors";

// AUTHENTICATION MIDDLEWARE
// Validates Bearer JWT access token and populates req.context
// with user identity fields.

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Bearer token required"));
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);

    req.context = {
      ...req.context,
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      permissions: payload.permissions,
      sessionId: payload.sessionId,
      hospitalId: payload.hospitalId,
    };

    next();
  } catch (err) {
    next(err);
  }
}

// Variant that does not throw if missing (for optional auth)
export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.context = {
      ...req.context,
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      permissions: payload.permissions,
      sessionId: payload.sessionId,
      hospitalId: payload.hospitalId,
    };
  } catch {
    // Ignore invalid token for optional auth
  }

  next();
}
