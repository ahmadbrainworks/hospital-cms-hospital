/**
 * Desired-state service.
 *
 * The vendor operator publishes a desired state for one or more instances.
 * The agent fetches the current desired state on each heartbeat and
 * reconciles the local system to match it.
 */
import { Db } from "mongodb";
import { createLogger } from "@hospital-cms/logger";
import { NotFoundError } from "@hospital-cms/errors";
import type { DesiredStateDocument, ReconciliationSummary } from "@hospital-cms/contracts";
import { CP_COLLECTIONS } from "../db";

const logger = createLogger({ module: "DesiredStateService" });

interface DesiredStateRecord extends DesiredStateDocument {
  instanceId: string;
  updatedAt: Date;
}

interface ReconciliationRecord extends ReconciliationSummary {
  instanceId: string;
  recordedAt: Date;
}

export class DesiredStateService {
  constructor(private readonly db: Db) {}

  private col() {
    return this.db.collection<DesiredStateRecord>(CP_COLLECTIONS.DESIRED_STATES);
  }

  private reconciliationCol() {
    return this.db.collection<ReconciliationRecord>(CP_COLLECTIONS.RECONCILIATION_HISTORY);
  }

  /** Get the current desired state for an instance. */
  async getForInstance(instanceId: string): Promise<DesiredStateDocument | null> {
    const doc = await this.col().findOne({ instanceId });
    if (!doc) return null;
    const { instanceId: _id, updatedAt: _ua, ...state } = doc;
    return state as DesiredStateDocument;
  }

  /** Publish a new desired state for an instance (increments version). */
  async publish(
    instanceId: string,
    patch: Partial<Omit<DesiredStateDocument, "version" | "publishedAt">>,
  ): Promise<DesiredStateDocument> {
    const existing = await this.col().findOne({ instanceId });
    const nextVersion = (existing?.version ?? 0) + 1;

    const state: DesiredStateDocument = {
      version: nextVersion,
      publishedAt: new Date().toISOString(),
      packages: patch.packages ?? existing?.packages ?? [],
      config: patch.config ?? existing?.config ?? {},
      featureFlags: patch.featureFlags ?? existing?.featureFlags ?? {},
      maintenanceWindow: patch.maintenanceWindow ?? existing?.maintenanceWindow,
    };

    await this.col().updateOne(
      { instanceId },
      { $set: { ...state, instanceId, updatedAt: new Date() } },
      { upsert: true },
    );

    logger.info({ instanceId, version: nextVersion }, "Desired state published");
    return state;
  }

  /** Record a reconciliation summary received from a heartbeat. */
  async recordReconciliation(
    instanceId: string,
    summary: ReconciliationSummary,
  ): Promise<void> {
    await this.reconciliationCol().insertOne({
      ...summary,
      instanceId,
      recordedAt: new Date(),
    });
  }

  /** Get recent reconciliation history for an instance. */
  async getReconciliationHistory(
    instanceId: string,
    limit = 20,
  ): Promise<ReconciliationRecord[]> {
    return this.reconciliationCol()
      .find({ instanceId })
      .sort({ recordedAt: -1 })
      .limit(limit)
      .toArray();
  }

  /** List all instances that have an active desired state. */
  async listAll(): Promise<Array<{ instanceId: string; version: number; updatedAt: Date }>> {
    const docs = await this.col()
      .find({}, { projection: { instanceId: 1, version: 1, updatedAt: 1 } })
      .toArray();
    return docs.map((d: DesiredStateRecord) => ({
      instanceId: d.instanceId,
      version: d.version,
      updatedAt: d.updatedAt,
    }));
  }
}
