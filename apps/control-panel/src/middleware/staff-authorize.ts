/**
 * Permission-based authorization middleware for vendor staff.
 *
 * Must be used after requireStaffAuth so that req.staffContext is populated.
 */
import { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "@hospital-cms/errors";
import { checkVendorPermission, hasAnyVendorPermission } from "../auth/vendor-role-permissions";
import type { VendorPermission } from "../types/vendor-auth";

/**
 * Require a single permission. 403 if the staff lacks it.
 */
export function requirePermission(permission: VendorPermission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.staffContext) {
      next(new UnauthorizedError("Authentication required"));
      return;
    }

    if (!checkVendorPermission(req.staffContext.permissions, permission)) {
      next(new ForbiddenError(`Missing permission: ${permission}`));
      return;
    }

    next();
  };
}

/**
 * Require at least one of the listed permissions. 403 if none are present.
 */
export function requireAnyPermission(...permissions: VendorPermission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.staffContext) {
      next(new UnauthorizedError("Authentication required"));
      return;
    }

    if (!hasAnyVendorPermission(req.staffContext.permissions, permissions)) {
      next(
        new ForbiddenError(
          `Missing one of required permissions: ${permissions.join(", ")}`,
        ),
      );
      return;
    }

    next();
  };
}
