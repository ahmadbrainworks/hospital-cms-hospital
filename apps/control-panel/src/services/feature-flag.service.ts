import { Db } from "mongodb";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "@hospital-cms/logger";
import { CP_COLLECTIONS } from "../db";

const logger = createLogger({ module: "FeatureFlagService" });

// ─── Types ──────────────────────────────────────────────────────────

export type FlagCondition =
  | { type: "instance"; instanceIds: string[] }
  | { type: "tier"; tiers: string[] }
  | { type: "percentage"; percent: number; salt: string }
  | { type: "all" };

export interface FeatureFlag {
  flagId: string;
  name: string;
  description: string;
  defaultValue: boolean;
  overrides: Array<{
    condition: FlagCondition;
    value: boolean;
    reason: string;
  }>;
  killed: boolean;
  killedAt?: string;
  killedBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Service ────────────────────────────────────────────────────────

export class FeatureFlagService {
  constructor(private readonly db: Db) {}

  private col() {
    return this.db.collection(CP_COLLECTIONS.FEATURE_FLAGS);
  }

  /** Resolve all flags for a given instance, returning a flat map. */
  async resolveFlags(
    instanceId: string,
    tier?: string,
  ): Promise<Record<string, boolean>> {
    const flags = await this.col().find({}).toArray();
    const result: Record<string, boolean> = {};

    for (const doc of flags) {
      const flag = doc as unknown as FeatureFlag;

      // Kill switch overrides everything
      if (flag.killed) {
        result[flag.flagId] = false;
        continue;
      }

      let resolved = flag.defaultValue;

      // Evaluate overrides top-to-bottom, first match wins
      for (const override of flag.overrides) {
        if (this.matchesCondition(override.condition, instanceId, tier)) {
          resolved = override.value;
          break;
        }
      }

      result[flag.flagId] = resolved;
    }

    return result;
  }

  private matchesCondition(
    condition: FlagCondition,
    instanceId: string,
    tier?: string,
  ): boolean {
    switch (condition.type) {
      case "all":
        return true;
      case "instance":
        return condition.instanceIds.includes(instanceId);
      case "tier":
        return tier ? condition.tiers.includes(tier) : false;
      case "percentage": {
        const hash = createHash("sha256")
          .update(condition.salt + instanceId)
          .digest("hex");
        const bucket = parseInt(hash.substring(0, 8), 16) % 100;
        return bucket < condition.percent;
      }
      default:
        return false;
    }
  }

  /** Kill a flag — emergency disable across all instances. */
  async killFlag(flagId: string, staffId: string): Promise<void> {
    await this.col().updateOne(
      { flagId },
      {
        $set: {
          killed: true,
          killedAt: new Date().toISOString(),
          killedBy: staffId,
          updatedAt: new Date().toISOString(),
        },
      },
    );
    logger.warn({ flagId, staffId }, "Feature flag killed");
  }

  /** Un-kill a flag. */
  async unkillFlag(flagId: string, staffId: string): Promise<void> {
    await this.col().updateOne(
      { flagId },
      {
        $set: {
          killed: false,
          updatedAt: new Date().toISOString(),
        },
        $unset: { killedAt: "", killedBy: "" },
      },
    );
    logger.info({ flagId, staffId }, "Feature flag un-killed");
  }

  // ─── CRUD ───────────────────────────────────────────────────────────

  async list(): Promise<FeatureFlag[]> {
    return this.col().find({}).sort({ createdAt: -1 }).toArray() as unknown as FeatureFlag[];
  }

  async getById(flagId: string): Promise<FeatureFlag | null> {
    return this.col().findOne({ flagId }) as unknown as FeatureFlag | null;
  }

  async create(data: {
    flagId: string;
    name: string;
    description: string;
    defaultValue: boolean;
    overrides?: FeatureFlag["overrides"];
    createdBy: string;
  }): Promise<FeatureFlag> {
    const now = new Date().toISOString();
    const flag: FeatureFlag = {
      flagId: data.flagId,
      name: data.name,
      description: data.description,
      defaultValue: data.defaultValue,
      overrides: data.overrides ?? [],
      killed: false,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.col().insertOne(flag as any);
    return flag;
  }

  async update(
    flagId: string,
    updates: Partial<Pick<FeatureFlag, "name" | "description" | "defaultValue" | "overrides">>,
  ): Promise<void> {
    await this.col().updateOne(
      { flagId },
      { $set: { ...updates, updatedAt: new Date().toISOString() } },
    );
  }

  async delete(flagId: string): Promise<void> {
    await this.col().deleteOne({ flagId });
  }
}
