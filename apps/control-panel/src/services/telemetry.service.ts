/**
 * Telemetry ingestion service.
 *
 * Receives TelemetryBatch payloads from the agent (posted via heartbeat or
 * independently for high-severity events) and stores them in the
 * cp_telemetry_events collection with TTL-based expiry.
 */
import { Db } from "mongodb";
import { createLogger } from "@hospital-cms/logger";
import type {
  TelemetryEvent,
  TelemetryBatch,
  TelemetryTimeSeriesPoint,
  TelemetryQueryResult,
  TelemetryEventCategory,
} from "@hospital-cms/contracts";
import { CP_COLLECTIONS } from "../db";

const logger = createLogger({ module: "TelemetryService" });

export class TelemetryService {
  constructor(private readonly db: Db) {}

  private col() {
    return this.db.collection<TelemetryEvent>(CP_COLLECTIONS.TELEMETRY_EVENTS);
  }

  /** Ingest a telemetry batch posted by the agent. */
  async ingest(batch: TelemetryBatch): Promise<void> {
    if (!batch.events.length) return;

    // Validate event count to prevent abuse
    if (batch.events.length > 1000) {
      throw new Error("Telemetry batch too large (max 1000 events)");
    }

    await this.col().insertMany(batch.events);

    const errorCount = batch.events.filter((e) => e.severity === "error" || e.severity === "critical").length;
    logger.info(
      {
        instanceId: batch.instanceId,
        count: batch.events.length,
        errorCount,
      },
      "Telemetry batch ingested",
    );

    // Log high-severity events at warn level for visibility
    for (const ev of batch.events) {
      if (ev.severity === "critical") {
        logger.warn(
          { instanceId: ev.instanceId, action: ev.action, meta: ev.meta },
          "CRITICAL telemetry event",
        );
      }
    }
  }

  /** Query telemetry time-series for a given instance and time window. */
  async query(params: {
    instanceId?: string;
    category?: TelemetryEventCategory;
    from: Date;
    to: Date;
    bucketMinutes?: number;
  }): Promise<TelemetryQueryResult> {
    const { instanceId, category, from, to, bucketMinutes = 60 } = params;

    const match: Record<string, unknown> = {
      occurredAt: {
        $gte: from.toISOString(),
        $lte: to.toISOString(),
      },
    };
    if (instanceId) match["instanceId"] = instanceId;
    if (category) match["category"] = category;

    const bucketMs = bucketMinutes * 60 * 1000;

    // Use aggregation to build time-series buckets
    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            $toDate: {
              $subtract: [
                { $toLong: { $toDate: "$occurredAt" } },
                {
                  $mod: [
                    { $toLong: { $toDate: "$occurredAt" } },
                    bucketMs,
                  ],
                },
              ],
            },
          },
          count: { $sum: 1 },
          errorCount: {
            $sum: {
              $cond: [{ $in: ["$severity", ["error", "critical"]] }, 1, 0],
            },
          },
          warnCount: {
            $sum: { $cond: [{ $eq: ["$severity", "warn"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 as const } },
    ];

    const buckets = await this.col().aggregate<{
      _id: Date;
      count: number;
      errorCount: number;
      warnCount: number;
    }>(pipeline).toArray();

    const totalEvents = buckets.reduce((sum: number, b: { count: number }) => sum + b.count, 0);

    const result: TelemetryQueryResult = {
      from: from.toISOString(),
      to: to.toISOString(),
      series: buckets.map((b: { _id: Date; count: number; errorCount: number; warnCount: number }) => ({
        bucket: b._id.toISOString(),
        count: b.count,
        errorCount: b.errorCount,
        warnCount: b.warnCount,
      })),
      totalEvents,
    };
    if (instanceId !== undefined) result.instanceId = instanceId;
    if (category !== undefined) result.category = category;
    return result;
  }

  /** Get recent events for an instance (for the live event feed). */
  async getRecent(
    instanceId: string,
    limit = 50,
    category?: TelemetryEventCategory,
  ): Promise<TelemetryEvent[]> {
    const filter: Record<string, unknown> = { instanceId };
    if (category) filter["category"] = category;
    return this.col()
      .find(filter)
      .sort({ occurredAt: -1 })
      .limit(limit)
      .toArray();
  }

  /** Count events by severity for a summary dashboard widget. */
  async getSummary(
    instanceId: string,
    since: Date,
  ): Promise<Record<string, number>> {
    const result = await this.col()
      .aggregate<{ _id: string; count: number }>([
        {
          $match: {
            instanceId,
            occurredAt: { $gte: since.toISOString() },
          },
        },
        { $group: { _id: "$severity", count: { $sum: 1 } } },
      ])
      .toArray();

    return Object.fromEntries(result.map((r: { _id: string; count: number }) => [r._id, r.count]));
  }
}
