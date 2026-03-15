import { Db } from "mongodb";
import { createLogger } from "@hospital-cms/logger";
import { CP_COLLECTIONS } from "../db";

const logger = createLogger({ module: "AnomalyDetector" });

// ─── Types ──────────────────────────────────────────────────────────

export interface BehavioralBaseline {
  instanceId: string;
  avgCpuPercent: number;
  avgMemoryPercent: number;
  avgDiskPercent: number;
  avgHeartbeatIntervalMs: number;
  avgActiveEncounters: number;
  stdDevCpu: number;
  stdDevMemory: number;
  stdDevHeartbeatInterval: number;
  computedAt: string;
}

export interface AnomalyScore {
  instanceId: string;
  totalScore: number;
  signals: Array<{
    signal: string;
    weight: number;
    triggered: boolean;
    detail: string;
  }>;
  evaluatedAt: string;
}

// ─── Service ────────────────────────────────────────────────────────

export class AnomalyDetectorService {
  constructor(private readonly db: Db) {}

  private baselinesCol() {
    return this.db.collection(CP_COLLECTIONS.BEHAVIORAL_BASELINES);
  }

  /** Recompute baseline from last 7 days of metrics. */
  async recomputeBaseline(instanceId: string): Promise<BehavioralBaseline> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const metrics = await this.db
      .collection(CP_COLLECTIONS.METRICS_HISTORY)
      .find({ instanceId, recordedAt: { $gte: sevenDaysAgo } })
      .sort({ recordedAt: 1 })
      .toArray();

    if (metrics.length < 10) {
      // Not enough data for a meaningful baseline
      const baseline: BehavioralBaseline = {
        instanceId,
        avgCpuPercent: 0,
        avgMemoryPercent: 0,
        avgDiskPercent: 0,
        avgHeartbeatIntervalMs: 30000,
        avgActiveEncounters: 0,
        stdDevCpu: 100,
        stdDevMemory: 100,
        stdDevHeartbeatInterval: 60000,
        computedAt: new Date().toISOString(),
      };
      await this.baselinesCol().updateOne(
        { instanceId },
        { $set: baseline },
        { upsert: true },
      );
      return baseline;
    }

    const cpuValues = metrics.map((m) => (m["cpuPercent"] as number) ?? 0);
    const memValues = metrics.map((m) => (m["memoryPercent"] as number) ?? 0);
    const diskValues = metrics.map((m) => (m["diskPercent"] as number) ?? 0);
    const encounterValues = metrics.map((m) => (m["activeEncounters"] as number) ?? 0);

    // Compute heartbeat intervals
    const intervals: number[] = [];
    for (let i = 1; i < metrics.length; i++) {
      const prev = new Date(metrics[i - 1]!["recordedAt"] as Date).getTime();
      const curr = new Date(metrics[i]!["recordedAt"] as Date).getTime();
      intervals.push(curr - prev);
    }

    const baseline: BehavioralBaseline = {
      instanceId,
      avgCpuPercent: avg(cpuValues),
      avgMemoryPercent: avg(memValues),
      avgDiskPercent: avg(diskValues),
      avgHeartbeatIntervalMs: intervals.length > 0 ? avg(intervals) : 30000,
      avgActiveEncounters: avg(encounterValues),
      stdDevCpu: stdDev(cpuValues),
      stdDevMemory: stdDev(memValues),
      stdDevHeartbeatInterval: intervals.length > 0 ? stdDev(intervals) : 60000,
      computedAt: new Date().toISOString(),
    };

    await this.baselinesCol().updateOne(
      { instanceId },
      { $set: baseline },
      { upsert: true },
    );

    logger.info({ instanceId, dataPoints: metrics.length }, "Baseline recomputed");
    return baseline;
  }

  /** Score an incoming heartbeat against the baseline. */
  async scoreHeartbeat(
    instanceId: string,
    metrics: { cpuPercent: number; memoryPercent: number; diskPercent: number },
    agentVersion?: string,
    runtimeHash?: string,
    fingerprintChanged?: boolean,
  ): Promise<AnomalyScore> {
    const baselineDoc = await this.baselinesCol().findOne({ instanceId });
    const baseline = baselineDoc as unknown as BehavioralBaseline | null;

    const signals: AnomalyScore["signals"] = [];
    let totalScore = 0;

    if (baseline && baseline.stdDevCpu > 0) {
      // CPU anomaly
      const cpuZ = Math.abs(metrics.cpuPercent - baseline.avgCpuPercent) / Math.max(baseline.stdDevCpu, 1);
      const cpuTriggered = cpuZ > 3;
      signals.push({ signal: "cpu_anomaly", weight: 0.15, triggered: cpuTriggered, detail: `Z-score: ${cpuZ.toFixed(2)}` });
      if (cpuTriggered) totalScore += 0.15;

      // Memory anomaly
      const memZ = Math.abs(metrics.memoryPercent - baseline.avgMemoryPercent) / Math.max(baseline.stdDevMemory, 1);
      const memTriggered = memZ > 3;
      signals.push({ signal: "memory_anomaly", weight: 0.10, triggered: memTriggered, detail: `Z-score: ${memZ.toFixed(2)}` });
      if (memTriggered) totalScore += 0.10;
    }

    // Fingerprint change
    if (fingerprintChanged) {
      signals.push({ signal: "fingerprint_change", weight: 0.25, triggered: true, detail: "Hardware fingerprint changed" });
      totalScore += 0.25;
    }

    // Runtime hash mismatch would be checked externally — just add signal slot
    if (runtimeHash === "mismatch") {
      signals.push({ signal: "runtime_hash_mismatch", weight: 0.30, triggered: true, detail: "Binary modification detected" });
      totalScore += 0.30;
    }

    return {
      instanceId,
      totalScore: Math.min(totalScore, 1.0),
      signals,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /** Recompute baselines for all active instances. */
  async recomputeAllBaselines(): Promise<number> {
    const instances = await this.db
      .collection(CP_COLLECTIONS.INSTANCES)
      .find({})
      .project({ instanceId: 1 })
      .toArray();

    let count = 0;
    for (const inst of instances) {
      try {
        await this.recomputeBaseline(inst["instanceId"] as string);
        count++;
      } catch (err) {
        logger.error({ err, instanceId: inst["instanceId"] }, "Baseline recomputation failed");
      }
    }
    return count;
  }

  async getBaseline(instanceId: string): Promise<BehavioralBaseline | null> {
    return this.baselinesCol().findOne({ instanceId }) as unknown as BehavioralBaseline | null;
  }
}

// ─── Math helpers ───────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = avg(values);
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(avg(squaredDiffs));
}
