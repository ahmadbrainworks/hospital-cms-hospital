/**
 * Feature gate middleware.
 *
 * Use these helpers to gate routes behind license feature flags checked
 * against the ActiveLicenseContext set by licenseGuard.
 *
 * Example:
 *   router.use('/plugins', requireFeature('plugin_runtime'), pluginRoutes)
 *   router.post('/export', requireAnyFeature('fhir_export', 'bulk_export'), ...)
 *   router.use('/ai', requireTier('enterprise'), ...)
 */
import { Request, Response, NextFunction } from "express";
import {
  LicenseFeatureDisabledError,
  LicenseExpiredError,
} from "@hospital-cms/errors";
import type { ActiveLicenseContext } from "@hospital-cms/contracts";

function getLicense(res: Response): ActiveLicenseContext | null {
  return (res.locals["license"] as ActiveLicenseContext) ?? null;
}

/**
 * Requires that the active license includes ALL of the given feature flags.
 */
export function requireFeature(...features: string[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const license = getLicense(res);
    if (!license) {
      return next(new LicenseExpiredError("License context not available"));
    }
    for (const f of features) {
      if (!license.features.includes(f)) {
        return next(new LicenseFeatureDisabledError(f));
      }
    }
    next();
  };
}

/**
 * Requires that the active license includes AT LEAST ONE of the given flags.
 */
export function requireAnyFeature(...features: string[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const license = getLicense(res);
    if (!license) {
      return next(new LicenseExpiredError("License context not available"));
    }
    if (!features.some((f) => license.features.includes(f))) {
      return next(new LicenseFeatureDisabledError(features.join(" | ")));
    }
    next();
  };
}

/**
 * Requires that the active license tier matches one of the given tiers.
 * Tiers are compared case-insensitively.
 */
export function requireTier(...tiers: string[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const license = getLicense(res);
    if (!license) {
      return next(new LicenseExpiredError("License context not available"));
    }
    const allowed = tiers.map((t) => t.toLowerCase());
    if (!allowed.includes(license.tier.toLowerCase())) {
      return next(
        new LicenseFeatureDisabledError(
          `Requires tier: ${tiers.join(" or ")} (current: ${license.tier})`,
        ),
      );
    }
    next();
  };
}

/**
 * Rejects the request if the instance is in restricted mode.
 * Use on any write endpoint to enforce read-only mode when the license
 * is in the grace period.
 */
export function rejectIfRestricted(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const license = getLicense(res);
  if (license?.isRestricted) {
    return next(
      new LicenseFeatureDisabledError(
        "Instance is in restricted mode — write operations are disabled",
      ),
    );
  }
  next();
}
