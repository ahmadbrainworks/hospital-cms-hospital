/**
 * Agent-facing routes — called by the hospital management agent.
 * These routes are outbound-only from the hospital's perspective (agent → control-panel).
 * No vendor API key required; authenticated via RSA-signed heartbeat payload.
 */
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ValidationError, UnauthorizedError } from "@hospital-cms/errors";
import { verifyWithPublicKey } from "@hospital-cms/crypto";
import type {
  DesiredStateDocument,
  EnrichedDesiredPackageEntry,
  EnrichedDesiredStateDocument,
} from "@hospital-cms/contracts";
import type { InstanceService } from "../services/instance.service";
import type { CommandService } from "../services/command.service";
import type { LicenseService } from "../services/license.service";
import type { DesiredStateService } from "../services/desired-state.service";
import type { PackageAssignmentService } from "../services/package-assignment.service";
import type { PackageRegistryService } from "../services/package-registry.service";
import type { HeartbeatPayload } from "../types";

const HeartbeatSchema = z.object({
  instanceId: z.string().uuid(),
  agentVersion: z.string(),
  metrics: z.object({
    cpuPercent: z.number().min(0).max(100),
    memoryPercent: z.number().min(0).max(100),
    diskPercent: z.number().min(0).max(100),
    activeEncounters: z.number().int().min(0),
    totalPatients: z.number().int().min(0),
    uptimeSeconds: z.number().int().min(0),
  }),
  networkQuality: z.enum(["excellent", "good", "degraded", "offline"]),
  currentPackages: z.array(
    z.object({
      packageId: z.string(),
      packageType: z.enum(["plugin", "theme", "widget"]),
      version: z.string(),
      status: z.string(),
    }),
  ),
  timestamp: z.number().int(),
  nonce: z.string().min(16),
  hardwareFingerprintHash: z.string().length(64).optional(),
  backupStatus: z.object({
    backupConfigured: z.boolean(),
    lastBackupAt: z.string().nullable(),
    lastBackupSizeBytes: z.number().nullable(),
    backupMethod: z.enum(["mongodump", "lvm_snapshot", "cloud_snapshot", "unknown", "none"]),
    backupLocation: z.enum(["local", "remote", "cloud", "unknown"]),
    staleDays: z.number(),
    healthy: z.boolean(),
  }).optional(),
  signature: z.string(),
  reconciliation: z
    .object({
      appliedStateVersion: z.number().int(),
      completedAt: z.string(),
      packagesInstalled: z.array(z.string()),
      packagesRemoved: z.array(z.string()),
      packagesFailed: z.array(z.object({ packageId: z.string(), error: z.string() })),
      configKeysApplied: z.array(z.string()),
      errors: z.array(z.string()),
    })
    .optional(),
});

const CommandResultSchema = z.object({
  commandId: z.string().uuid(),
  instanceId: z.string().uuid(),
  success: z.boolean(),
  message: z.string(),
  timestamp: z.number().int(),
  signature: z.string(),
});

/**
 * Enrich a DesiredStateDocument's package entries with download metadata
 * from the package registry so the agent can download and verify packages.
 */
async function enrichDesiredState(
  doc: DesiredStateDocument,
  packageRegistryService: PackageRegistryService,
): Promise<EnrichedDesiredStateDocument> {
  const enrichedPackages: EnrichedDesiredPackageEntry[] = [];

  for (const entry of doc.packages) {
    if (entry.action === "remove") {
      // Remove entries don't need download metadata
      enrichedPackages.push({
        ...entry,
        packageType: "plugin", // placeholder — agent ignores type for removals
        downloadUrl: "",
        checksum: "",
        manifestSignature: "",
      });
      continue;
    }

    try {
      const manifest = await packageRegistryService.getManifest(
        entry.packageId,
        entry.version!,
      );
      enrichedPackages.push({
        ...entry,
        packageType: manifest.type,
        downloadUrl: manifest.downloadUrl,
        checksum: manifest.checksum,
        manifestSignature: manifest.signature,
      });
    } catch {
      // Package not found in registry — skip (agent will handle gracefully)
      enrichedPackages.push({
        ...entry,
        packageType: "plugin",
        downloadUrl: "",
        checksum: "",
        manifestSignature: "",
      });
    }
  }

  return {
    version: doc.version,
    publishedAt: doc.publishedAt,
    packages: enrichedPackages,
    config: doc.config,
    featureFlags: doc.featureFlags,
    maintenanceWindow: doc.maintenanceWindow,
  };
}

export function createAgentRouter(
  instanceService: InstanceService,
  commandService: CommandService,
  licenseService: LicenseService,
  desiredStateService: DesiredStateService,
  packageAssignmentService: PackageAssignmentService,
  packageRegistryService: PackageRegistryService,
): Router {
  const router = Router();

  // POST /agent/heartbeat — main agent check-in
  router.post(
    "/heartbeat",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = HeartbeatSchema.parse(req.body) as HeartbeatPayload;
        const sourceIp = req.ip ?? req.socket.remoteAddress ?? "unknown";

        const desiredState = await instanceService.processHeartbeat(
          body,
          sourceIp,
        );

        // Record reconciliation summary if provided
        if (body.reconciliation) {
          await desiredStateService
            .recordReconciliation(body.instanceId, body.reconciliation)
            .catch((e: unknown) => {
              /* fire-and-forget */ void e;
            });
          // Update assignment statuses based on reconciliation results
          await packageAssignmentService
            .processReconciliation(body.instanceId, body.reconciliation)
            .catch((e: unknown) => {
              /* fire-and-forget */ void e;
            });
        }

        // Return desired state + pending commands
        const pendingCommands = await commandService.getPendingForInstance(
          body.instanceId,
        );
        const license = await licenseService.getActiveForInstance(
          body.instanceId,
        );
        const desiredStateDoc = await desiredStateService.getForInstance(body.instanceId);

        // Enrich desired state with package download metadata
        let enrichedDesiredState: EnrichedDesiredStateDocument | null = null;
        if (desiredStateDoc) {
          enrichedDesiredState = await enrichDesiredState(
            desiredStateDoc,
            packageRegistryService,
          );
        }

        res.json({
          success: true,
          data: {
            desiredState: enrichedDesiredState,
            pendingCommands,
            license: license
              ? {
                  tier: license.tier,
                  features: license.features,
                  maxBeds: license.maxBeds,
                  expiresAt: license.expiresAt,
                  issuedAt: license.issuedAt,
                  signature: license.signature,
                }
              : null,
            serverTime: Date.now(),
          },
        });
      } catch (err) {
        if (err instanceof z.ZodError)
          return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  // POST /agent/commands/:commandId/result — agent reports command execution result
  router.post(
    "/commands/:commandId/result",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = CommandResultSchema.parse(req.body);
        const instanceId = req.headers["x-instance-id"] as string;
        if (!instanceId || instanceId !== body.instanceId) {
          return next(new ValidationError("Missing or mismatched X-Instance-Id header"));
        }

        // Verify the result is signed by this instance's RSA private key
        const instance = await instanceService.getByInstanceId(instanceId);
        const { signature, ...unsigned } = body;
        const signedData = JSON.stringify(unsigned, Object.keys(unsigned).sort());
        const valid = verifyWithPublicKey(Buffer.from(signedData), signature, instance.publicKey);
        if (!valid) {
          return next(new UnauthorizedError("Command result signature invalid"));
        }

        await commandService.recordExecution(body.commandId, instanceId, {
          success: body.success,
          message: body.message,
        });

        res.json({ success: true, data: null });
      } catch (err) {
        if (err instanceof z.ZodError)
          return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  // POST /agent/rotate-key — instance key rotation
  router.post(
    "/rotate-key",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { instanceId, newPublicKey, timestamp, signature } = req.body as {
          instanceId?: string;
          newPublicKey?: string;
          timestamp?: number;
          signature?: string;
        };

        if (!instanceId || !newPublicKey || !timestamp || !signature) {
          return next(new ValidationError("Missing required fields: instanceId, newPublicKey, timestamp, signature"));
        }

        // Timestamp must be within 5 minutes
        if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
          return next(new ValidationError("Key rotation timestamp too far from server time"));
        }

        const instance = await instanceService.getByInstanceId(instanceId);

        // Verify signature with current (old) public key
        const unsigned = { instanceId, newPublicKey, timestamp };
        const signedData = JSON.stringify(unsigned, Object.keys(unsigned).sort());
        const valid = verifyWithPublicKey(
          Buffer.from(signedData),
          signature,
          instance.publicKey,
        );
        if (!valid) {
          return next(new UnauthorizedError("Key rotation signature invalid — must be signed with current private key"));
        }

        await instanceService.rotatePublicKey(instanceId, newPublicKey);

        res.json({ success: true, data: { message: "Key rotated successfully" } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
