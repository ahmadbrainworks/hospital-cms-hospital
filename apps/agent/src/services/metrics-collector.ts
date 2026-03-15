import { readFileSync, statfsSync } from "node:fs";
import { createLogger } from "@hospital-cms/logger";

const logger = createLogger({ module: "MetricsCollector" });

export interface SystemMetrics {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  activeEncounters: number;
  totalPatients: number;
  uptimeSeconds: number;
}

//  CPU sampling via /proc/stat
interface CpuSnapshot {
  active: number;
  total: number;
}

function snapCpu(): CpuSnapshot | null {
  try {
    const line = readFileSync("/proc/stat", "utf-8").split("\n")[0] ?? "";
    const parts = line
      .replace(/^cpu\s+/, "")
      .split(/\s+/)
      .map(Number);
    const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0] = parts;
    const total = user + nice + system + idle + iowait;
    return { active: total - (idle + iowait), total };
  } catch {
    return null;
  }
}

async function sampleCpuPercent(): Promise<number> {
  const s1 = snapCpu();
  if (!s1) return 0;
  await new Promise((r) => setTimeout(r, 250));
  const s2 = snapCpu();
  if (!s2) return 0;
  const totalDelta = s2.total - s1.total;
  if (totalDelta === 0) return 0;
  return Math.round(((s2.active - s1.active) / totalDelta) * 100);
}

//  Memory via /proc/meminfo
function readMemoryPercent(): number {
  try {
    const meminfo = readFileSync("/proc/meminfo", "utf-8");
    const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
    const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
    if (!totalMatch?.[1] || !availMatch?.[1]) return 0;
    const total = parseInt(totalMatch[1]);
    const avail = parseInt(availMatch[1]);
    return Math.round(((total - avail) / total) * 100);
  } catch {
    return 0;
  }
}

//  Disk via statfs
function readDiskPercent(mountPath = "/"): number {
  try {
    const stats = statfsSync(mountPath);
    const used = stats.blocks - stats.bfree;
    return stats.blocks > 0 ? Math.round((used / stats.blocks) * 100) : 0;
  } catch {
    return 0;
  }
}

export class MetricsCollector {
  private lastNetworkCheckAt = 0;
  private lastLatencyMs = -1;
  private readonly NETWORK_CHECK_INTERVAL_MS = 5 * 30_000; // every 5 heartbeat cycles

  constructor(
    private readonly apiBaseUrl: string,
    private readonly controlPanelUrl: string,
    private readonly adminToken: string | undefined,
  ) {}

  async collect(): Promise<SystemMetrics> {
    const [cpuPercent, appMetrics] = await Promise.all([
      sampleCpuPercent(),
      this.collectAppMetrics(),
    ]);

    return {
      cpuPercent,
      memoryPercent: readMemoryPercent(),
      diskPercent: readDiskPercent("/"),
      uptimeSeconds: Math.floor(process.uptime()),
      ...appMetrics,
    };
  }

  /**
   * Probes the control-panel /health endpoint and classifies
   * network quality. Throttled to avoid flooding the wire.
   */
  async measureNetworkQuality(): Promise<{
    latencyMs: number;
    quality: "excellent" | "good" | "degraded" | "offline";
  }> {
    const now = Date.now();
    if (
      now - this.lastNetworkCheckAt < this.NETWORK_CHECK_INTERVAL_MS &&
      this.lastLatencyMs >= 0
    ) {
      return {
        latencyMs: this.lastLatencyMs,
        quality: this.classify(this.lastLatencyMs),
      };
    }

    this.lastNetworkCheckAt = now;
    const start = Date.now();
    try {
      await fetch(`${this.controlPanelUrl}/health`, {
        signal: AbortSignal.timeout(10_000),
      });
      this.lastLatencyMs = Date.now() - start;
    } catch {
      this.lastLatencyMs = -1;
    }

    logger.debug({ latencyMs: this.lastLatencyMs }, "Network quality measured");
    return {
      latencyMs: this.lastLatencyMs,
      quality: this.classify(this.lastLatencyMs),
    };
  }

  private classify(
    latencyMs: number,
  ): "excellent" | "good" | "degraded" | "offline" {
    if (latencyMs < 0) return "offline";
    if (latencyMs < 100) return "excellent";
    if (latencyMs < 500) return "good";
    return "degraded";
  }

  private async collectAppMetrics(): Promise<{
    activeEncounters: number;
    totalPatients: number;
  }> {
    if (!this.adminToken) return { activeEncounters: 0, totalPatients: 0 };
    try {
      const res = await fetch(`${this.apiBaseUrl}/api/v1/system/metrics`, {
        headers: { Authorization: `Bearer ${this.adminToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { activeEncounters: 0, totalPatients: 0 };
      const data = (await res.json()) as {
        data?: { app?: { activeEncounters?: number; totalPatients?: number } };
      };
      return {
        activeEncounters: data.data?.app?.activeEncounters ?? 0,
        totalPatients: data.data?.app?.totalPatients ?? 0,
      };
    } catch (err) {
      logger.debug({ err }, "Failed to collect app metrics");
      return { activeEncounters: 0, totalPatients: 0 };
    }
  }
}
