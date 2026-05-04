import express, { Application, Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Db } from "mongodb";
import { getConfig } from "@hospital-cms/config";
import { logger } from "@hospital-cms/logger";
import { requestContextMiddleware } from "./middleware/request-context";
import { errorHandler } from "./middleware/error-handler";
import { notFoundHandler } from "./middleware/not-found";
import { authRouter } from "./routes/auth.routes";
import { userRouter } from "./routes/user.routes";
import { patientRouter } from "./routes/patient.routes";
import { doctorRouter } from "./routes/doctor.routes";
import { wardRouter } from "./routes/ward.routes";
import { encounterRouter } from "./routes/encounter.routes";
import { billingRouter } from "./routes/billing.routes";
import { labRouter } from "./routes/lab.routes";
import { pharmacyRouter } from "./routes/pharmacy.routes";
import { workflowRouter } from "./routes/workflow.routes";
import { pluginRouter } from "./routes/plugin.routes";
import { themeRouter } from "./routes/theme.routes";
import { widgetRouter } from "./routes/widget.routes";
import { auditRouter } from "./routes/audit.routes";
import { healthRouter } from "./routes/health.routes";
import { systemRouter } from "./routes/system.routes";
import { sseRouter } from "./routes/sse.routes";
import { reportRouter } from "./routes/report.routes";
import { agentInternalRouter } from "./routes/agent-internal.routes";
import { installGuard } from "./middleware/install-guard";
import { licenseGuard, requireFeature } from "./middleware/license-guard";
import { sanitizeBody, sanitizeQuery } from "./middleware/sanitize";
import { HospitalRepository } from "@hospital-cms/database";

const log = logger("api:app");

export function createApp(db: Db): Application {
  const cfg = getConfig();
  const app = express();

  //  Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  //  CORS
  app.use(
    cors({
      origin: cfg.CORS_ORIGINS,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Trace-ID", "X-Agent-Secret"],
      exposedHeaders: ["X-Trace-ID"],
      credentials: true,
      maxAge: 3600, // Cache preflight for 1 hour
    }),
  );

  //  Body parsing
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  //  Rate limiting — global
  const limiter = rateLimit({
    windowMs: cfg.RATE_LIMIT_WINDOW_MS,
    max: cfg.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    // Key by authenticated userId when available, otherwise by IP
    keyGenerator: (req) => req.context?.userId ?? req.ip ?? "unknown",
    message: {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please slow down.",
      },
    },
  });
  app.use("/api/", limiter);

  //  Auth rate limiting — stricter, by IP only
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    skipSuccessfulRequests: true,
    message: {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many authentication attempts.",
      },
    },
  });
  app.use("/api/v1/auth/", authLimiter);

  //  Write-operation rate limiting (mutations)
  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) =>
      `write:${req.context?.userId ?? req.ip ?? "unknown"}`,
    skip: (req) =>
      req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
    message: {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many write operations. Please slow down.",
      },
    },
  });
  app.use("/api/v1/", writeLimiter);

  //  Input sanitization (before routing)
  app.use(sanitizeBody);
  app.use(sanitizeQuery);

  //  Request context (traceId, timing)
  app.use(requestContextMiddleware);

  //  Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      log.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration,
          traceId: req.context?.traceId,
          userId: req.context?.userId,
        },
        "HTTP request",
      );
    });
    next();
  });

  //  Health routes (no auth, no install guard)
  app.use("/health", healthRouter(db));

  //  Agent-internal routes (secret-gated, no user auth or license check)
  app.use("/api/agent", agentInternalRouter(db));

  //  Install guard: block all API if not installed
  const hospitalRepo = new HospitalRepository(db);
  app.use("/api/", installGuard(hospitalRepo));

  //  API routes
  const apiRouter = express.Router();

  apiRouter.use("/auth", authRouter(db));
  apiRouter.use(licenseGuard(db));
  apiRouter.use("/users", userRouter(db));
  apiRouter.use("/patients", patientRouter(db));
  apiRouter.use("/doctors", doctorRouter(db));
  apiRouter.use("/wards", wardRouter(db));
  apiRouter.use("/encounters", encounterRouter(db));
  apiRouter.use("/billing", billingRouter(db));
  apiRouter.use("/lab", labRouter(db));
  apiRouter.use("/pharmacy", pharmacyRouter(db));
  // Phase 2 features gated by license feature flags
  apiRouter.use(
    "/workflows",
    requireFeature("workflow_engine"),
    workflowRouter(db),
  );
  apiRouter.use("/plugins", requireFeature("plugin_runtime"), pluginRouter(db));
  apiRouter.use("/themes", requireFeature("theme_engine"), themeRouter(db));
  apiRouter.use("/widgets", widgetRouter(db));
  apiRouter.use("/audit", auditRouter(db));
  apiRouter.use("/system", systemRouter(db));
  apiRouter.use("/events", sseRouter());
  apiRouter.use("/reports", reportRouter(db));

  app.use("/api/v1", apiRouter);

  //  404 handler
  app.use(notFoundHandler);

  //  Centralized error handler
  app.use(errorHandler);

  return app;
}
