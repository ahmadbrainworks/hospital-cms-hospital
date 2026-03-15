import { Db } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "@hospital-cms/logger";
import { NotFoundError } from "@hospital-cms/errors";
import { CP_COLLECTIONS } from "../db";

const logger = createLogger({ module: "RolloutService" });

// ─── Types ──────────────────────────────────────────────────────────

export interface RolloutWave {
  waveNumber: number;
  instanceIds: string[];
  tierFilter?: string[];
  percentage?: number;
  scheduledAt: string;
  status: "pending" | "deploying" | "completed" | "failed" | "paused";
  completedAt?: string;
}

export interface Rollout {
  rolloutId: string;
  packageId: string;
  version: string;
  waves: RolloutWave[];
  createdBy: string;
  createdAt: string;
  pausedAt?: string;
  cancelledAt?: string;
}

// ─── Service ────────────────────────────────────────────────────────

export class RolloutService {
  constructor(private readonly db: Db) {}

  private col() {
    return this.db.collection(CP_COLLECTIONS.ROLLOUT_WAVES);
  }

  async createRollout(data: {
    packageId: string;
    version: string;
    waves: Array<{
      instanceIds: string[];
      tierFilter?: string[];
      percentage?: number;
      scheduledAt: string;
    }>;
    createdBy: string;
  }): Promise<Rollout> {
    const rollout: Rollout = {
      rolloutId: uuidv4(),
      packageId: data.packageId,
      version: data.version,
      waves: data.waves.map((w, i) => ({
        ...w,
        waveNumber: i + 1,
        status: "pending" as const,
      })),
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
    };
    await this.col().insertOne(rollout as any);
    logger.info(
      { rolloutId: rollout.rolloutId, packageId: data.packageId, waveCount: rollout.waves.length },
      "Rollout created",
    );
    return rollout;
  }

  async getById(rolloutId: string): Promise<Rollout> {
    const doc = await this.col().findOne({ rolloutId });
    if (!doc) throw new NotFoundError("Rollout not found");
    return doc as unknown as Rollout;
  }

  async list(filters?: { packageId?: string; limit?: number }): Promise<Rollout[]> {
    const query: Record<string, unknown> = {};
    if (filters?.packageId) query["packageId"] = filters.packageId;
    return this.col()
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filters?.limit ?? 50)
      .toArray() as unknown as Rollout[];
  }

  /** Advance a rollout to deploy the next pending wave. */
  async advanceRollout(rolloutId: string): Promise<RolloutWave | null> {
    const rollout = await this.getById(rolloutId);
    if (rollout.cancelledAt || rollout.pausedAt) return null;

    const nextWave = rollout.waves.find((w) => w.status === "pending");
    if (!nextWave) return null;

    nextWave.status = "deploying";
    await this.col().updateOne(
      { rolloutId },
      { $set: { waves: rollout.waves } },
    );

    logger.info(
      { rolloutId, waveNumber: nextWave.waveNumber },
      "Rollout wave advancing",
    );
    return nextWave;
  }

  /** Mark a wave as completed. */
  async completeWave(rolloutId: string, waveNumber: number): Promise<void> {
    const rollout = await this.getById(rolloutId);
    const wave = rollout.waves.find((w) => w.waveNumber === waveNumber);
    if (!wave) return;

    wave.status = "completed";
    wave.completedAt = new Date().toISOString();

    await this.col().updateOne(
      { rolloutId },
      { $set: { waves: rollout.waves } },
    );
  }

  /** Mark a wave as failed. */
  async failWave(rolloutId: string, waveNumber: number): Promise<void> {
    const rollout = await this.getById(rolloutId);
    const wave = rollout.waves.find((w) => w.waveNumber === waveNumber);
    if (!wave) return;

    wave.status = "failed";
    wave.completedAt = new Date().toISOString();

    await this.col().updateOne(
      { rolloutId },
      { $set: { waves: rollout.waves } },
    );
  }

  /** Pause a rollout — halts further wave advancement. */
  async pauseRollout(rolloutId: string): Promise<void> {
    await this.col().updateOne(
      { rolloutId },
      { $set: { pausedAt: new Date().toISOString() } },
    );
    logger.info({ rolloutId }, "Rollout paused");
  }

  /** Resume a paused rollout. */
  async resumeRollout(rolloutId: string): Promise<void> {
    await this.col().updateOne(
      { rolloutId },
      { $unset: { pausedAt: "" } },
    );
    logger.info({ rolloutId }, "Rollout resumed");
  }

  /** Cancel a rollout. */
  async cancelRollout(rolloutId: string): Promise<void> {
    await this.col().updateOne(
      { rolloutId },
      { $set: { cancelledAt: new Date().toISOString() } },
    );
    logger.info({ rolloutId }, "Rollout cancelled");
  }
}
