import { createHash } from "crypto";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { createLogger } from "@hospital-cms/logger";
import { computeFingerprint } from "./hardware-fingerprint";
import type { LocalState } from "./types";

const logger = createLogger({ module: "DiagnosticsCollector" });

export interface DiagnosticsBundle {
  generatedAt: string;
  instanceId: string;
  agentVersion: string;

  system: {
    os: string;
    kernel: string;
    arch: string;
    cpuModel: string;
    cpuCores: number;
    totalMemoryMB: number;
    diskTotalGB: number;
    diskUsedGB: number;
    uptimeSeconds: number;
    nodeVersion: string;
  };

  packages: Array<{
    packageId: string;
    packageType: string;
    version: string;
    status: string;
  }>;

  recentErrors: Array<{
    timestamp: string;
    source: string;
    message: string;
  }>;

  connectivity: {
    controlPanelReachable: boolean;
    controlPanelLatencyMs: number;
    databaseHealthy: boolean;
    databaseLatencyMs: number;
  };

  configuration: {
    envVarsPresent: string[];
    envVarsMissing: string[];
    heartbeatIntervalMs: number;
    lastHeartbeatAt: string | null;
    lastReconcileAt: string | null;
    desiredStateVersion: number;
  };
}

const REQUIRED_ENV_VARS = [
  "CONTROL_PANEL_URL",
  "INSTANCE_ID",
  "AGENT_PRIVATE_KEY",
  "VENDOR_PUBLIC_KEY",
  "MONGODB_URI",
];

const OPTIONAL_ENV_VARS = [
  "HEARTBEAT_INTERVAL_MS",
  "API_BASE_URL",
  "API_ADMIN_TOKEN",
  "BACKUP_DIR",
  "LOG_LEVEL",
];

export class DiagnosticsCollector {
  constructor(
    private readonly instanceId: string,
    private readonly agentVersion: string,
    private readonly controlPanelUrl: string,
    private readonly heartbeatIntervalMs: number,
  ) {}

  async collect(localState: LocalState): Promise<DiagnosticsBundle> {
    const fp = computeFingerprint();

    const [connectivity, diskInfo] = await Promise.all([
      this.checkConnectivity(),
      this.getDiskInfo(),
    ]);

    const envVarsPresent: string[] = [];
    const envVarsMissing: string[] = [];
    for (const v of [...REQUIRED_ENV_VARS, ...OPTIONAL_ENV_VARS]) {
      if (process.env[v]) envVarsPresent.push(v);
      else envVarsMissing.push(v);
    }

    return {
      generatedAt: new Date().toISOString(),
      instanceId: this.instanceId,
      agentVersion: this.agentVersion,

      system: {
        os: fp.osRelease,
        kernel: this.readFileSafe("/proc/version").split(" ").slice(0, 3).join(" ") || "unknown",
        arch: process.arch,
        cpuModel: fp.cpuModel,
        cpuCores: fp.cpuCores,
        totalMemoryMB: fp.totalMemoryMB,
        diskTotalGB: diskInfo.totalGB,
        diskUsedGB: diskInfo.usedGB,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
      },

      packages: localState.installedPackages.map((p) => ({
        packageId: p.packageId,
        packageType: p.packageType,
        version: p.version,
        status: p.status,
      })),

      recentErrors: [], // Could be populated from a ring buffer in production

      connectivity,

      configuration: {
        envVarsPresent,
        envVarsMissing,
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        lastHeartbeatAt: localState.lastHeartbeatAt,
        lastReconcileAt: localState.lastReconcileAt,
        desiredStateVersion: localState.desiredStateVersion,
      },
    };
  }

  private async checkConnectivity(): Promise<DiagnosticsBundle["connectivity"]> {
    let controlPanelReachable = false;
    let controlPanelLatencyMs = -1;
    let databaseHealthy = false;
    let databaseLatencyMs = -1;

    // Check control panel
    try {
      const start = Date.now();
      const resp = await fetch(`${this.controlPanelUrl}/health`, {
        signal: AbortSignal.timeout(10000),
      });
      controlPanelLatencyMs = Date.now() - start;
      controlPanelReachable = resp.ok;
    } catch {
      controlPanelReachable = false;
    }

    // Check database (via API health)
    try {
      const start = Date.now();
      const resp = await fetch(
        `${process.env["API_BASE_URL"] ?? "http://localhost:4000"}/health`,
        { signal: AbortSignal.timeout(10000) },
      );
      databaseLatencyMs = Date.now() - start;
      databaseHealthy = resp.ok;
    } catch {
      databaseHealthy = false;
    }

    return {
      controlPanelReachable,
      controlPanelLatencyMs,
      databaseHealthy,
      databaseLatencyMs,
    };
  }

  private getDiskInfo(): { totalGB: number; usedGB: number } {
    try {
      const meminfo = this.readFileSafe("/proc/mounts");
      // Simplified — return 0 if can't determine
      return { totalGB: 0, usedGB: 0 };
    } catch {
      return { totalGB: 0, usedGB: 0 };
    }
  }

  private readFileSafe(path: string): string {
    try {
      if (existsSync(path)) return readFileSync(path, "utf-8").trim();
    } catch { /* ignore */ }
    return "";
  }
}
