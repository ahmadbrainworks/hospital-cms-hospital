import { Router } from "express";
import { Db } from "mongodb";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { sendSuccess } from "../helpers/response";
import { Permission } from "@hospital-cms/shared-types";
import {
  HospitalRepository,
  LicenseRepository,
  COLLECTIONS,
} from "@hospital-cms/database";
import {
  getCachedLicenseInfo,
  _resetLicenseCache,
} from "../middleware/license-guard";

export function systemRouter(db: Db): Router {
  const router = Router();
  const hospitalRepo = new HospitalRepository(db);
  const licenseRepo = new LicenseRepository(db);

  router.use(authenticate);

  // GET /system/info
  router.get(
    "/info",
    requirePermission(Permission.SYSTEM_SETTINGS_READ),
    async (req, res, next) => {
      try {
        const instance = await hospitalRepo.findSingle();
        sendSuccess(res, instance, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /system/license — DB record + cached cryptographic verification result
  router.get(
    "/license",
    requirePermission(Permission.SYSTEM_SETTINGS_READ),
    async (req, res, next) => {
      try {
        const instance = await hospitalRepo.findSingle();
        if (!instance) {
          sendSuccess(res, null);
          return;
        }
        const license = await licenseRepo.findByInstanceId(instance.instanceId);
        const verified = getCachedLicenseInfo();
        sendSuccess(
          res,
          {
            license,
            verified: verified
              ? {
                  tier: verified.tier,
                  features: verified.features,
                  maxBeds: verified.maxBeds,
                  expiresAt: verified.expiresAt,
                  signatureValid: true,
                }
              : null,
          },
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /system/license/refresh — bust cache and force re-verify next request
  router.post(
    "/license/refresh",
    requirePermission(Permission.SYSTEM_SETTINGS_WRITE),
    async (req, res, next) => {
      try {
        _resetLicenseCache();
        sendSuccess(
          res,
          { message: "License cache cleared" },
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /system/metrics — aggregate operational + process metrics
  router.get(
    "/metrics",
    requirePermission(Permission.SYSTEM_SETTINGS_READ),
    async (req, res, next) => {
      try {
        const [
          totalPatients,
          activeEncounters,
          totalUsers,
          pendingLabOrders,
          pendingInvoices,
          auditEventsLast24h,
        ] = await Promise.all([
          db
            .collection(COLLECTIONS.PATIENTS)
            .countDocuments({ deletedAt: null }),
          db.collection(COLLECTIONS.ENCOUNTERS).countDocuments({
            status: {
              $in: [
                "REGISTERED",
                "TRIAGE",
                "WITH_DOCTOR",
                "ADMITTED",
                "WAITING_FOR_DOCTOR",
              ],
            },
            deletedAt: null,
          }),
          db
            .collection(COLLECTIONS.USERS)
            .countDocuments({ deletedAt: null, isActive: true }),
          db.collection(COLLECTIONS.LAB_ORDERS).countDocuments({
            status: { $in: ["ORDERED", "SAMPLE_COLLECTED", "PROCESSING"] },
          }),
          db
            .collection(COLLECTIONS.INVOICES)
            .countDocuments({ status: { $in: ["DRAFT", "ISSUED"] } }),
          db.collection(COLLECTIONS.AUDIT_LOGS).countDocuments({
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          }),
        ]);

        const mem = process.memoryUsage();
        const verified = getCachedLicenseInfo();

        sendSuccess(
          res,
          {
            app: {
              totalPatients,
              activeEncounters,
              totalUsers,
              pendingLabOrders,
              pendingInvoices,
              auditEventsLast24h,
            },
            system: {
              uptimeSeconds: Math.floor(process.uptime()),
              memoryMb: {
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
                rss: Math.round(mem.rss / 1024 / 1024),
              },
              nodeVersion: process.version,
              platform: process.platform,
            },
            license: verified
              ? {
                  tier: verified.tier,
                  expiresAt: verified.expiresAt,
                  features: verified.features,
                }
              : null,
            timestamp: new Date().toISOString(),
          },
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /system/config — apply config k/v (called by agent reconciler)
  router.post(
    "/config",
    requirePermission(Permission.SYSTEM_SETTINGS_WRITE),
    async (req, res, next) => {
      try {
        const config = req.body?.config as Record<string, string> | undefined;
        if (!config || typeof config !== "object")
          return next(new Error("config object required"));
        await db
          .collection("hospital_instance")
          .updateOne({}, { $set: { config, configUpdatedAt: new Date() } });
        sendSuccess(
          res,
          { applied: Object.keys(config).length },
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /system/cache/clear — target for agent CLEAR_CACHE command
  router.post(
    "/cache/clear",
    requirePermission(Permission.SYSTEM_SETTINGS_WRITE),
    async (_req, res, next) => {
      try {
        _resetLicenseCache();
        sendSuccess(
          res,
          { message: "Cache cleared" },
          200,
          undefined,
          undefined,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * POST /system/license/rotate
   *
   * Called by the management agent after the control-panel issues a new
   * signed license (e.g. renewal, tier upgrade). The agent pushes the new
   * token here so the local DB is always authoritative.
   *
   * Body: { token: string, signature: string }
   */
  router.post(
    "/license/rotate",
    requirePermission(Permission.SYSTEM_SETTINGS_WRITE),
    async (req, res, next) => {
      try {
        const { token, signature } = req.body as {
          token?: string;
          signature?: string;
        };
        if (!token || !signature) {
          return next(new Error("token and signature are required"));
        }

        // Verify the token signature before persisting
        const { verifyLicenseToken } = await import("@hospital-cms/crypto");
        const vendorPublicKey = process.env["VENDOR_PUBLIC_KEY"];
        if (!vendorPublicKey)
          return next(new Error("VENDOR_PUBLIC_KEY not configured"));

        let payload: Record<string, unknown>;
        try {
          payload = verifyLicenseToken(token, vendorPublicKey) as unknown as Record<
            string,
            unknown
          >;
        } catch {
          return next(new Error("License token signature invalid"));
        }

        const instance = await hospitalRepo.findSingle();
        if (!instance) return next(new Error("Hospital instance not found"));

        if (payload["instanceId"] !== instance.instanceId) {
          return next(new Error("License token is not for this instance"));
        }

        // Monotonicity: reject tokens older than the currently stored one
        const existing = await db
          .collection(COLLECTIONS.LICENSES)
          .findOne({ instanceId: instance.instanceId });
        if (existing?.["issuedAt"]) {
          const existingIssuedAt = new Date(existing["issuedAt"] as string).getTime();
          const newIssuedAt = new Date(payload["issuedAt"] as string).getTime();
          if (newIssuedAt <= existingIssuedAt) {
            return next(
              new Error(
                "License token issuedAt must be newer than the current token (replay prevented)",
              ),
            );
          }
        }

        // Persist: upsert the license record for this instance
        await db.collection(COLLECTIONS.LICENSES).updateOne(
          { instanceId: instance.instanceId },
          {
            $set: {
              token,
              signature,
              features: payload["features"],
              tier: payload["tier"],
              issuedAt: new Date(payload["issuedAt"] as string),
              expiresAt: new Date(payload["expiresAt"] as string),
              status: "ACTIVE",
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        );

        // Bust cache so the new token is verified on the next request
        _resetLicenseCache();

        sendSuccess(
          res,
          {
            message: "License rotated successfully",
            expiresAt: payload["expiresAt"],
          },
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
