import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { DEFAULT_LOCK_FILE } from "@hospital-cms/config";

// SERVER BOOTSTRAP
// Checks installation status first:
//   - Not installed → starts minimal health-only server so the web
//     middleware can detect the state and redirect to /install.
//   - Installed → validates config → connects DB → starts full API.

const API_PORT = Number(process.env["API_PORT"] ?? 4000);
const API_HOST = process.env["API_HOST"] ?? "0.0.0.0";
const LOCK_FILE = process.env["INSTALLER_LOCK_FILE"] ?? DEFAULT_LOCK_FILE;

/**
 * Minimal server that only serves /health while waiting for installation.
 * No database, no config validation — just enough for the web middleware.
 */
function startInstallerModeServer(): void {
  const app = express();
  app.use(cors());

  app.get("/health", (_req, res) => {
    // Re-check on every request so it picks up installation immediately
    res.json({
      status: "ok",
      isInstalled: existsSync(LOCK_FILE),
      timestamp: new Date().toISOString(),
      mode: "awaiting-installation",
    });
  });

  app.all("*", (_req, res) => {
    res.status(503).json({
      success: false,
      error: {
        code: "NOT_INSTALLED",
        message: "Hospital CMS is not installed yet. Complete the installer at /install.",
      },
    });
  });

  const server = app.listen(API_PORT, API_HOST, () => {
    console.log(`[api] Awaiting installation — health-only server on :${API_PORT}`);
    console.log(`[api] Complete the installer, then restart the API.`);
  });

  // Watch for lock file creation → auto-restart into full mode
  const checkInterval = setInterval(() => {
    if (existsSync(LOCK_FILE)) {
      console.log("[api] Installation detected — restarting into full mode...");
      clearInterval(checkInterval);
      server.close(() => {
        bootstrapFull();
      });
    }
  }, 2000);

  const shutdown = (signal: string) => {
    console.log(`[api] ${signal} received — shutting down installer-mode server`);
    clearInterval(checkInterval);
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

/**
 * Full server with config validation, database, and all routes.
 */
async function bootstrapFull(): Promise<void> {
  // These imports are deferred so they only run after config is available
  const { getConfig, resetConfig, loadInstallerOutput } = await import("@hospital-cms/config");
  const { logger } = await import("@hospital-cms/logger");
  const { connectDatabase, ensureIndexes } = await import("@hospital-cms/database");
  const { createApp } = await import("./app.js");

  const log = logger("api:server");

  // Re-read the lock file (may have been written after module-load time)
  loadInstallerOutput();
  resetConfig();
  const cfg = getConfig();

  log.info({ env: cfg.NODE_ENV }, "Starting Hospital CMS API");

  // Startup validation — warn about missing production-critical vars
  if (cfg.NODE_ENV === "production") {
    const warnings: string[] = [];

    if (!cfg.VENDOR_PUBLIC_KEY) {
      warnings.push("VENDOR_PUBLIC_KEY is not set — license verification and package signing will fail");
    }
    if (!cfg.AGENT_SECRET) {
      warnings.push("AGENT_SECRET is not set — agent-only package routes will be inaccessible");
    }
    if (!cfg.ENCRYPTION_KEY) {
      warnings.push("ENCRYPTION_KEY is not set — MFA secret encryption is disabled");
    }

    for (const w of warnings) {
      log.warn(w);
    }
    if (warnings.length > 0) {
      log.warn(
        { count: warnings.length },
        "Production startup completed with configuration warnings — review above",
      );
    }
  }

  // 1. Database connection
  const db = await connectDatabase();

  // 2. Ensure all indexes exist (idempotent)
  await ensureIndexes(db);

  // 3. Initialize hospital_instance record if it doesn't exist
  const instanceCol = db.collection("hospital_instance");
  const existingInstance = await instanceCol.findOne({});
  if (!existingInstance) {
    const instanceId = cfg.INSTANCE_ID;
    if (!instanceId) {
      throw new Error("INSTANCE_ID not configured — cannot initialize hospital_instance");
    }
    await instanceCol.insertOne({
      instanceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    log.info({ instanceId }, "Initialized hospital_instance record");
  }

  // 4. Create and configure Express app
  const app = createApp(db);

  // 4. Start HTTP server
  const server = app.listen(cfg.API_PORT, cfg.API_HOST, () => {
    log.info(
      { port: cfg.API_PORT, host: cfg.API_HOST },
      "API server listening",
    );
  });

  // 5. Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, "Shutdown signal received");
    server.close(async () => {
      log.info("HTTP server closed");
      const { disconnectDatabase } = await import("@hospital-cms/database");
      await disconnectDatabase();
      log.info("Database disconnected. Goodbye.");
      process.exit(0);
    });

    // Force kill if graceful shutdown takes too long
    setTimeout(() => {
      log.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    log.fatal({ err }, "Uncaught exception — shutting down");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    log.fatal({ reason }, "Unhandled promise rejection — shutting down");
    process.exit(1);
  });
}

// Entry point: check lock file to decide which mode to start in
if (existsSync(LOCK_FILE)) {
  bootstrapFull().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
} else {
  startInstallerModeServer();
}
