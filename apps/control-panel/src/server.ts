import { MongoClient } from "mongodb";
import { createLogger } from "@hospital-cms/logger";
import { ensureControlPanelIndexes } from "./db";
import { createControlPanelApp } from "./app";
import { StaffService } from "./services/staff.service";
import { VendorRole } from "./types/vendor-auth";

const logger = createLogger({ module: "ControlPanelServer" });

/**
 * Seed the initial VENDOR_SUPER_ADMIN account if no staff exist yet.
 * Uses CP_INITIAL_ADMIN_EMAIL / CP_INITIAL_ADMIN_PASSWORD env vars.
 */
async function seedInitialAdmin(db: import("mongodb").Db): Promise<void> {
  const staffService = new StaffService(db);
  const count = await staffService.countStaff();
  if (count > 0) return;

  const email = process.env["CP_INITIAL_ADMIN_EMAIL"];
  const password = process.env["CP_INITIAL_ADMIN_PASSWORD"];

  if (!email || !password) {
    logger.warn(
      "No staff accounts exist and CP_INITIAL_ADMIN_EMAIL / CP_INITIAL_ADMIN_PASSWORD are not set. " +
      "Set these env vars to auto-create the initial admin on next startup.",
    );
    return;
  }

  try {
    const admin = await staffService.createStaff({
      email,
      username: "admin",
      displayName: "System Administrator",
      password,
      role: VendorRole.VENDOR_SUPER_ADMIN,
      createdBy: "system-seed",
    });
    logger.info({ staffId: admin.staffId, email }, "Initial VENDOR_SUPER_ADMIN created");
  } catch (err) {
    logger.error({ err }, "Failed to seed initial admin — check CP_INITIAL_ADMIN_EMAIL / CP_INITIAL_ADMIN_PASSWORD");
  }
}

async function main() {
  const mongoUri = process.env["CONTROL_PANEL_MONGODB_URI"];
  if (!mongoUri) throw new Error("CONTROL_PANEL_MONGODB_URI is required");

  const vendorPrivateKey = process.env["VENDOR_PRIVATE_KEY"];
  if (!vendorPrivateKey) throw new Error("VENDOR_PRIVATE_KEY is required");

  const port = parseInt(process.env["CONTROL_PANEL_PORT"] ?? "4000", 10);

  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db();
  await ensureControlPanelIndexes(db);
  logger.info("Control-panel database indexes ensured");

  await seedInitialAdmin(db);

  const { app, alertEngine, anomalyDetector } = createControlPanelApp(db, vendorPrivateKey);

  // Seed default alert rules
  await alertEngine.seedDefaults();

  // Start alert evaluation loop (every 60 seconds)
  const alertInterval = setInterval(() => {
    alertEngine.evaluate().catch((err) => logger.error({ err }, "Alert evaluation failed"));
  }, 60_000);

  // Recompute behavioral baselines every 6 hours
  const baselineInterval = setInterval(() => {
    anomalyDetector.recomputeAllBaselines().catch((err) => logger.error({ err }, "Baseline recomputation failed"));
  }, 6 * 60 * 60_000);

  const server = app.listen(port, () => {
    logger.info({ port }, "Control-panel listening");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");
    clearInterval(alertInterval);
    clearInterval(baselineInterval);
    server.close(async () => {
      await client.close();
      logger.info("Control-panel shutdown complete");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception");
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled rejection");
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("Control-panel startup failed:", err);
  process.exit(1);
});
