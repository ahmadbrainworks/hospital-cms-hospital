import express, { Application, Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Db } from "mongodb";
import { createLogger } from "@hospital-cms/logger";
import { AppError } from "@hospital-cms/errors";
import { ZodError } from "zod";

import { InstanceService } from "./services/instance.service";
import { LicenseService } from "./services/license.service";
import { CommandService } from "./services/command.service";
import { RegistrationTokenService } from "./services/registration-token.service";
import { StaffService } from "./services/staff.service";
import { StaffAuthService } from "./services/staff-auth.service";
import { StaffAuditService } from "./services/staff-audit.service";
import { createInstancesRouter } from "./routes/instances";
import { createLicensesRouter } from "./routes/licenses";
import { createAgentRouter } from "./routes/agent";
import { createStaffAuthRouter } from "./routes/staff-auth";
import { createStaffRouter } from "./routes/staff";
import { createStaffAuditRouter } from "./routes/staff-audit";
import { requireVendorAuthOrStaff } from "./middleware/staff-auth";
import { DesiredStateService } from "./services/desired-state.service";
import { PackageRegistryService } from "./services/package-registry.service";
import { PackageAssignmentService } from "./services/package-assignment.service";
import { DesiredStateBuilderService } from "./services/desired-state-builder.service";
import { createPackagesRouter } from "./routes/packages";
import { createDesiredStateRouter } from "./routes/desired-state";
import { createPackageAssignmentsRouter } from "./routes/package-assignments";
import { TelemetryService } from "./services/telemetry.service";
import { createTelemetryRouter } from "./routes/telemetry";
import { AlertEngineService } from "./services/alert-engine.service";
import { createAlertsRouter } from "./routes/alerts";
import { FeatureFlagService } from "./services/feature-flag.service";
import { createFeatureFlagsRouter } from "./routes/feature-flags";
import { RolloutService } from "./services/rollout.service";
import { createRolloutsRouter } from "./routes/rollouts";
import { AnomalyDetectorService } from "./services/anomaly-detector.service";

const logger = createLogger({ module: "ControlPanel" });

export interface ControlPanelApp {
  app: Application;
  alertEngine: AlertEngineService;
  anomalyDetector: AnomalyDetectorService;
}

export function createControlPanelApp(
  db: Db,
  vendorPrivateKey: string,
): ControlPanelApp {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  const allowedOrigins = process.env["VENDOR_DASHBOARD_ORIGIN"]
    ? process.env["VENDOR_DASHBOARD_ORIGIN"].split(",").map((o) => o.trim())
    : ["http://localhost:3003"];
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  // Global rate limit
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

  // Agent heartbeat — more permissive since it's machine-to-machine
  const agentLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });

  // Self-registration is unauthenticated — strict limit to prevent abuse
  const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: { success: false, error: { code: "RATE_LIMITED", message: "Too many registration attempts" } },
  });

  // Services
  const instanceService = new InstanceService(db);
  const licenseService = new LicenseService(db, vendorPrivateKey);
  const commandService = new CommandService(db, vendorPrivateKey);
  const registrationTokenService = new RegistrationTokenService(db);
  const desiredStateService = new DesiredStateService(db);
  const packageRegistryService = new PackageRegistryService(db, vendorPrivateKey);
  const desiredStateBuilder = new DesiredStateBuilderService(db, desiredStateService);
  const packageAssignmentService = new PackageAssignmentService(db, desiredStateBuilder, packageRegistryService);
  const telemetryService = new TelemetryService(db);
  const staffService = new StaffService(db);
  const staffAuthService = new StaffAuthService(db);
  const staffAuditService = new StaffAuditService(db);
  const alertEngine = new AlertEngineService(db);
  const featureFlagService = new FeatureFlagService(db);
  const rolloutService = new RolloutService(db);
  const anomalyDetector = new AnomalyDetectorService(db);

  // Health check (no auth)
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "control-panel",
      ts: new Date().toISOString(),
    });
  });

  // ─── Staff auth routes (no auth required for login/refresh) ──────
  app.use(
    "/api/auth",
    createStaffAuthRouter(staffAuthService, staffService),
  );

  // ─── Staff management routes (require staff auth + permissions) ──
  app.use("/api/vendor/staff", createStaffRouter(staffService));

  // ─── Staff audit log routes ──────────────────────────────────────
  app.use("/api/vendor/audit", createStaffAuditRouter(staffAuditService));

  // Agent routes (RSA-signed, no vendor API key)
  app.use(
    "/api/agent",
    agentLimiter,
    createAgentRouter(instanceService, commandService, licenseService, desiredStateService, packageAssignmentService, packageRegistryService),
  );

  /**
   * POST /api/instances/register — called by the installer.
   * Requires a pre-issued registration token (X-Registration-Token header)
   * so that only vendor-authorized deployments can create instances.
   */
  app.post(
    "/api/instances/register",
    registrationLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const regToken = req.headers["x-registration-token"] as string | undefined;
        if (!regToken) {
          return res.status(401).json({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Missing X-Registration-Token header" },
          });
        }
        // Validate + consume the token (throws NotFoundError if invalid/expired)
        await registrationTokenService.consume(regToken);

        const { hospitalName, hospitalSlug, publicKey, agentVersion } = req.body;
        const instance = await instanceService.register({
          hospitalName,
          hospitalSlug,
          publicKey,
          agentVersion,
        });
        res.status(201).json({ success: true, data: { instance } });
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * POST /api/registration-tokens/validate — installer checks a token before
   * the finalize step (non-destructive: does not consume the token).
   */
  app.post(
    "/api/registration-tokens/validate",
    registrationLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { token } = req.body as { token?: string };
        if (!token) {
          return res.status(400).json({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "token is required" },
          });
        }
        const result = await registrationTokenService.validate(token);
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    },
  );

    /**
   * POST /api/registration-tokens — vendor issues a new one-time registration
   * token for an upcoming hospital deployment.
   */
  app.post(
    "/api/registration-tokens",
    requireVendorAuthOrStaff,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { hospitalName } = req.body as { hospitalName?: string };
        const token = await registrationTokenService.issue(hospitalName);
        res.status(201).json({ success: true, data: { token } });
      } catch (err) {
        next(err);
      }
    },
  );

  // Vendor management routes (require vendor API key OR staff JWT)
  // /api/vendor/* aliases are used by the vendor dashboard frontend
  const instancesRouter = createInstancesRouter(instanceService, licenseService, commandService);
  const licensesRouter = createLicensesRouter(licenseService);

  app.use('/api/instances', requireVendorAuthOrStaff, instancesRouter);
  app.use('/api/vendor/instances', requireVendorAuthOrStaff, instancesRouter);
  app.use('/api/licenses', requireVendorAuthOrStaff, licensesRouter);
  app.use('/api/vendor/licenses', requireVendorAuthOrStaff, licensesRouter);

  // Package registry routes
  const packagesRouter = createPackagesRouter(packageRegistryService, packageAssignmentService);
  app.use('/api/vendor/packages', requireVendorAuthOrStaff, packagesRouter);

  // Package assignment routes
  const assignmentsRouter = createPackageAssignmentsRouter(packageAssignmentService);
  app.use('/api/vendor/assignments', requireVendorAuthOrStaff, assignmentsRouter);

  // Desired state routes
  const desiredStateRouter = createDesiredStateRouter(desiredStateService);
  app.use('/api/vendor/desired-state', requireVendorAuthOrStaff, desiredStateRouter);

  // Telemetry routes
  const telemetryRouter = createTelemetryRouter(telemetryService);
  app.use('/api/agent/telemetry', agentLimiter, telemetryRouter);
  app.use('/api/vendor/telemetry', requireVendorAuthOrStaff, telemetryRouter);

  // Alert routes
  const alertsRouter = createAlertsRouter(alertEngine);
  app.use('/api/vendor/alerts', alertsRouter);

  // Feature flag routes
  const featureFlagsRouter = createFeatureFlagsRouter(featureFlagService);
  app.use('/api/vendor/feature-flags', featureFlagsRouter);

  // Rollout routes
  const rolloutsRouter = createRolloutsRouter(rolloutService);
  app.use('/api/vendor/rollouts', rolloutsRouter);

  // GET /api/vendor/commands — flat list of all recent commands (dashboard use)
  app.get(
    '/api/vendor/commands',
    requireVendorAuthOrStaff,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const commands = await commandService.listRecent(100);
        res.json({ success: true, data: commands });
      } catch (err) {
        next(err);
      }
    },
  );

  // 404
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  // Error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: err.errors,
        },
      });
    }
    if (err instanceof AppError) {
      logger.warn({ code: err.code, status: err.statusCode }, err.message);
      return res
        .status(err.statusCode)
        .json({ success: false, error: err.toJSON() });
    }
    logger.error({ err }, "Unhandled error");
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  return { app, alertEngine, anomalyDetector };
}
