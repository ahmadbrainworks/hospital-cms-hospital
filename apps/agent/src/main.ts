import { createLogger } from "@hospital-cms/logger";
import { MongoClient, type Db } from "mongodb";
import type { ReconciliationSummary } from "@hospital-cms/contracts";
import { getAgentConfig } from "./config";
import { ControlPanelClient } from "./services/control-panel-client";
import { LicenseRefresher } from "./services/license-refresher";
import { MetricsCollector } from "./services/metrics-collector";
import { StateStore } from "./services/state-store";
import { PackageInstaller } from "./reconciler/package-installer";
import { CommandExecutor } from "./reconciler/command-executor";
import { Reconciler } from "./reconciler/reconciler";
import { KeyRotator } from "./services/key-rotator";
import type { LocalState } from "./services/types";

const logger = createLogger({ module: "Agent" });

function extractHospitalIdFromToken(token: string, instanceId: string): string {
  if (!token) {
    // Fallback: use instanceId as hospitalId if no token provided
    if (!instanceId) {
      throw new Error("Unable to determine hospitalId — both token and instanceId are missing");
    }
    logger.debug("No API_ADMIN_TOKEN provided; using instanceId as hospitalId");
    return instanceId;
  }

  try {
    // JWT format: header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) {
      // Not a JWT, treat as hex string and fallback to instanceId
      logger.debug("API_ADMIN_TOKEN is not a JWT; using instanceId as hospitalId");
      return instanceId;
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64").toString("utf-8"),
    );
    const hospitalId = payload.hospitalId as string;

    if (!hospitalId) {
      logger.debug("Token does not include hospitalId claim; using instanceId as fallback");
      return instanceId;
    }

    return hospitalId;
  } catch (err) {
    logger.debug(
      { err },
      "Failed to parse API_ADMIN_TOKEN as JWT; falling back to instanceId",
    );
    return instanceId;
  }
}

async function connectLocalDatabase(): Promise<{
  client: MongoClient;
  db: Db;
} | null> {
  const mongoUri = process.env["MONGODB_URI"];
  if (!mongoUri) {
    logger.warn(
      "MONGODB_URI not set; local license lease refresh is disabled",
    );
    return null;
  }

  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    maxPoolSize: 5,
    minPoolSize: 1,
    retryWrites: true,
    retryReads: true,
  });

  await client.connect();

  return {
    client,
    db: client.db(process.env["MONGODB_DB_NAME"] ?? "hospital_cms"),
  };
}

async function main() {
  const config = getAgentConfig();

  logger.info(
    { instanceId: config.INSTANCE_ID, version: config.AGENT_VERSION },
    "Hospital Management Agent starting",
  );

  const localDatabase = await connectLocalDatabase().catch((err) => {
    logger.error(
      { err },
      "Failed to connect local MongoDB; continuing without lease refresh",
    );
    return null;
  });

  const stateStore = new StateStore(config.STATE_FILE_PATH);
  const cpClient = new ControlPanelClient(config);
  const licenseRefresher = localDatabase
    ? new LicenseRefresher(localDatabase.db, config)
    : null;
  const metricsCollector = new MetricsCollector(
    config.API_BASE_URL,
    config.CONTROL_PANEL_URL,
    config.API_ADMIN_TOKEN,
  );
  const packageInstaller = new PackageInstaller(
    config.PACKAGES_DIR,
    config.VENDOR_PUBLIC_KEY,
  );
  const commandExecutor = new CommandExecutor(config.VENDOR_PUBLIC_KEY, config.API_BASE_URL, config.API_ADMIN_TOKEN ?? "");

  // Key rotation support
  const keyRotator = new KeyRotator(
    config.CONTROL_PANEL_URL,
    config.INSTANCE_ID,
    () => cpClient.getPrivateKey(),
    (newKey) => cpClient.setPrivateKey(newKey),
    config.AGENT_PRIVATE_KEY_PATH,
  );
  commandExecutor.register("ROTATE_INSTANCE_KEY", async () => keyRotator.rotate());

  const hospitalId = extractHospitalIdFromToken(config.API_ADMIN_TOKEN ?? "", config.INSTANCE_ID);
  const reconciler = new Reconciler(
    packageInstaller,
    config.API_BASE_URL,
    config.API_ADMIN_TOKEN,
    hospitalId,
  );

  let localState: LocalState = stateStore.load();
  let running = true;
  let pendingReconciliation: ReconciliationSummary | undefined;

  const runCycle = async () => {
    const cycleStart = Date.now();
    logger.debug("Starting agent cycle");

    try {
      // 1. Collect metrics + network quality in parallel
      const [metrics, { quality: networkQuality }] = await Promise.all([
        metricsCollector.collect(),
        metricsCollector.measureNetworkQuality(),
      ]);

      // 2. Send heartbeat, get desired state + pending commands
      const heartbeatResponse = await cpClient.sendHeartbeat(
        metrics,
        networkQuality,
        localState.installedPackages,
        pendingReconciliation,
      );

      // Clear the pending reconciliation after successfully sending it
      pendingReconciliation = undefined;

      localState.lastHeartbeatAt = new Date().toISOString();

      if (licenseRefresher) {
        await licenseRefresher.processHeartbeatLicense(heartbeatResponse.license);
      } else if (heartbeatResponse.license !== null) {
        logger.warn(
          "Received license update but local lease refresh is unavailable",
        );
      }

      // 3b. If control-panel revoked the license, clear the local cache
      if (heartbeatResponse.license === null) {
        logger.warn("Control-panel returned license:null — clearing local license cache");
        try {
          await fetch(`${config.API_BASE_URL}/api/agent/clear-cache`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Agent-Secret": config.API_ADMIN_TOKEN ?? "",
            },
            signal: AbortSignal.timeout(10000),
          });
        } catch (err) {
          logger.warn({ err }, "Failed to clear license cache after revocation");
        }
      }

      // 4. Execute pending commands
      for (const command of heartbeatResponse.pendingCommands) {
        const result = await commandExecutor.execute(command);
        try {
          await cpClient.reportCommandResult(
            command.commandId,
            result.success,
            result.message,
          );
        } catch (err) {
          logger.error(
            { err, commandId: command.commandId },
            "Failed to report command result",
          );
        }
      }

      // 5. Reconcile desired state
      if (heartbeatResponse.desiredState) {
        const { state, summary } = await reconciler.reconcile(
          heartbeatResponse.desiredState,
          localState,
        );
        localState = state;

        // Queue reconciliation summary for the next heartbeat
        if (
          summary.packagesInstalled.length > 0 ||
          summary.packagesRemoved.length > 0 ||
          summary.packagesFailed.length > 0 ||
          summary.configKeysApplied.length > 0 ||
          summary.errors.length > 0
        ) {
          pendingReconciliation = summary;
        }
      } else {
        logger.debug("No desired state document returned by control-panel");
      }

      // 6. Save state
      stateStore.save(localState);

      const duration = Date.now() - cycleStart;
      logger.info({ duration, networkQuality }, "Agent cycle complete");
    } catch (err) {
      logger.error({ err }, "Agent cycle failed");
    }
  };

  // Run first cycle immediately
  await runCycle();

  // Schedule subsequent cycles
  const intervalId = setInterval(async () => {
    if (!running) return;
    await runCycle();
  }, config.HEARTBEAT_INTERVAL_MS);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Agent shutting down");
    running = false;
    clearInterval(intervalId);
    stateStore.save(localState);
    if (localDatabase) {
      try {
        await localDatabase.client.close();
      } catch (err) {
        logger.warn({ err }, "Failed to close local MongoDB client");
      }
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
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
  console.error("Agent startup failed:", err);
  process.exit(1);
});
