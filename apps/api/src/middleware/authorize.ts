import { Request, Response, NextFunction } from "express";
import type { Permission, UserRole } from "@hospital-cms/shared-types";
import { assertPermission, assertRole } from "@hospital-cms/rbac";
import { UnauthorizedError } from "@hospital-cms/errors";

// AUTHORIZATION MIDDLEWARE FACTORIES
// Use after authenticate middleware.

function getPermissionContext(req: Request) {
  if (!req.context.userId || !req.context.role || !req.context.permissions) {
    throw new UnauthorizedError();
  }
  return {
    userId: req.context.userId,
    role: req.context.role,
    permissions: req.context.permissions,
  };
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Skip authorization for CORS preflight requests
    if (req.method === "OPTIONS") {
      return next();
    }

    try {
      assertPermission(getPermissionContext(req), permission);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Skip authorization for CORS preflight requests
    if (req.method === "OPTIONS") {
      return next();
    }

    try {
      assertRole(getPermissionContext(req), roles);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireHospitalContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Skip hospital context check for CORS preflight requests
  if (req.method === "OPTIONS") {
    return next();
  }

  if (!req.context.hospitalId) {
    return next(new UnauthorizedError("Hospital context required"));
  }
  next();
}
