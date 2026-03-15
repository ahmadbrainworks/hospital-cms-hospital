import { getConfig } from "@hospital-cms/config";
import { logger } from "@hospital-cms/logger";
import { connectDatabase, ensureIndexes } from "@hospital-cms/database";
import { createApp } from "./app";

// SERVER BOOTSTRAP
// Validates config → connects DB → ensures indexes → starts HTTP

const log = logger("api:server");

async function bootstrap(): Promise<void> {
  const cfg = getConfig(); // Throws immediately if env is invalid

  log.info({ env: cfg.NODE_ENV }, "Starting Hospital CMS API");

  // 0. Startup validation — warn about missing production-critical vars
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

  // 3. Create and configure Express app
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

bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
