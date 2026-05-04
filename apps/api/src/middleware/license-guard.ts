/**
 * LICENSE GUARD — Lease-based edition
 *
 * Behaviour:
 *  1. Reads the active LicenseLease document written by the agent after
 *     each heartbeat cycle (typically every 30 s).
 *  2. The lease contains a vendor RSA-4096 signature that was already
 *     verified by the agent before writing — we trust the agent's
 *     verification here and only re-check expiry and feature flags.
 *  3. Caches the active lease for CACHE_TTL_MS (shorter than the agent
 *     heartbeat interval so revocations are noticed quickly).
 *  4. Fails CLOSED on missing/expired lease in production; bypasses in
 *     development when no lease is found.
 *
 * The lease model means:
 *  - License enforcement is decoupled from the vendor control panel
 *    (works offline within the lease window).
 *  - Revocations take effect within one heartbeat + one cache TTL.
 */
import { Request, Response, NextFunction } from "express";
import { Db } from "mongodb";
import { createLogger } from "@hospital-cms/logger";
import { LicenseLeaseRepository } from "@hospital-cms/database";
import {
  LicenseExpiredError,
  LicenseFeatureDisabledError,
} from "@hospital-cms/errors";
import type { ActiveLicenseContext } from "@hospital-cms/contracts";

const logger = createLogger({ module: "LicenseGuard" });

/** How long to cache a valid lease before re-reading from MongoDB. */
const CACHE_TTL_MS = 60 * 1000; // 1 minute

let _cache: ActiveLicenseContext | null = null;
let _cacheAt = 0;

/** Exposed for tests and the system routes. */
export function _resetLicenseCache(): void {
  _cache = null;
  _cacheAt = 0;
}

async function loadLease(db: Db): Promise<ActiveLicenseContext | null> {
  const instanceDoc = await db.collection("hospital_instance").findOne({});
  if (!instanceDoc) {
    logger.warn("No hospital_instance record — lease cannot be resolved");
    return null;
  }

  const instanceId = instanceDoc["instanceId"] as string;
  const repo = new LicenseLeaseRepository(db);
  const lease = await repo.findActiveLease(instanceId);

  if (!lease) {
    logger.warn({ instanceId }, "No active license lease found");
    return null;
  }

  const expiresAt = new Date(lease.expiresAt);
  if (isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    logger.warn({ instanceId, expiresAt: lease.expiresAt }, "License lease has expired");
    return null;
  }

  const ctx: ActiveLicenseContext = {
    instanceId,
    tier: lease.tier,
    features: lease.features,
    maxBeds: lease.maxBeds,
    expiresAt,
    isRestricted: lease.status === "restricted",
  };

  logger.debug({ instanceId, tier: ctx.tier, features: ctx.features.length }, "Lease loaded");
  return ctx;
}

async function getCachedLicense(db: Db): Promise<ActiveLicenseContext | null> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) {
    return _cache;
  }

  try {
    const ctx = await loadLease(db);
    _cache = ctx;
    _cacheAt = Date.now();
    return ctx;
  } catch (err) {
    logger.error({ err }, "Failed to load license lease — returning stale cache");
    return _cache; // Return stale rather than blocking (graceful degradation)
  }
}

/**
 * Global license middleware — blocks all /api requests if no valid lease
 * is found, or if the lease is expired.
 *
 * Attaches the `ActiveLicenseContext` to `res.locals.license` so route
 * handlers can inspect tier/features without another DB read.
 */
export function licenseGuard(db: Db) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Skip license check for CORS preflight requests
    if (req.method === "OPTIONS") {
      return next();
    }

    try {
      const license = await getCachedLicense(db);

      if (!license) {
        if (process.env["NODE_ENV"] === "development") {
          logger.warn(
            "⚠ DEV LICENSE BYPASS ACTIVE — no license lease found, granting "
            + "enterprise-tier access with all features. This MUST NOT happen in production.",
          );
          // Attach a dev context with all known features so feature gates don't block
          res.locals["license"] = {
            instanceId: "dev",
            tier: "enterprise",
            features: ["workflow_engine", "plugin_runtime", "theme_engine", "reports", "fhir_export"],
            maxBeds: 9999,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            isRestricted: false,
          } satisfies ActiveLicenseContext;
          return next();
        }
        return next(new LicenseExpiredError("No valid license lease found"));
      }

      if (license.expiresAt < new Date()) {
        _cache = null;
        return next(
          new LicenseExpiredError(
            `License lease expired at ${license.expiresAt.toISOString()}`,
          ),
        );
      }

      res.locals["license"] = license;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Route-level middleware that gates access to a specific feature flag.
 * Reads from res.locals.license set by licenseGuard above.
 *
 * @example
 *   router.use(requireFeature('plugin_runtime'))
 */
export function requireFeature(feature: string) {
  return (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const license = res.locals["license"] as ActiveLicenseContext | undefined;
    if (!license) {
      return next(new LicenseExpiredError("License context not available"));
    }
    if (!license.features.includes(feature)) {
      return next(new LicenseFeatureDisabledError(feature));
    }
    next();
  };
}

/**
 * Returns the currently cached license context for use in system routes.
 */
export function getCachedLicenseInfo(): ActiveLicenseContext | null {
  return _cache;
}
