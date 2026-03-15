/**
 * Staff audit service.
 *
 * Records all staff-initiated actions (login, logout, license operations,
 * command issuance, etc.) in the cp_staff_audit collection.
 * Separate from VendorAuditService which logs system-level operations.
 */
import { Db } from "mongodb";
import { createLogger } from "@hospital-cms/logger";
import { CP_COLLECTIONS } from "../db";
import type { StaffAuditEntry } from "../types/vendor-auth";

const logger = createLogger({ module: "StaffAudit" });

export class StaffAuditService {
  constructor(private readonly db: Db) {}

  private col() {
    return this.db.collection<StaffAuditEntry>(CP_COLLECTIONS.STAFF_AUDIT);
  }

  /** Fire-and-forget audit log entry. */
  log(
    staffId: string,
    staffEmail: string,
    action: string,
    detail: Record<string, unknown>,
    ipAddress: string,
  ): void {
    const entry: StaffAuditEntry = {
      staffId,
      staffEmail,
      action,
      detail,
      ipAddress,
      timestamp: new Date(),
    };

    this.col()
      .insertOne(entry)
      .catch((e: unknown) =>
        logger.warn({ err: e, action }, "Failed to write staff audit entry"),
      );
  }

  /** Query audit log with filters and pagination. */
  async query(params: {
    staffId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: StaffAuditEntry[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (params.staffId) filter["staffId"] = params.staffId;
    if (params.action) filter["action"] = params.action;
    if (params.from || params.to) {
      const ts: Record<string, Date> = {};
      if (params.from) ts["$gte"] = params.from;
      if (params.to) ts["$lte"] = params.to;
      filter["timestamp"] = ts;
    }

    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const [entries, total] = await Promise.all([
      this.col()
        .find(filter)
        .sort({ timestamp: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      this.col().countDocuments(filter),
    ]);

    return { entries, total };
  }

  /** Get distinct action types for filter dropdowns. */
  async getDistinctActions(): Promise<string[]> {
    return this.col().distinct("action");
  }

  /** Summary counts grouped by action for the last N hours. */
  async getStats(hours = 24): Promise<Record<string, number>> {
    const since = new Date(Date.now() - hours * 3600_000);
    const result = await this.col()
      .aggregate<{ _id: string; count: number }>([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray();
    return Object.fromEntries(
      result.map((r: { _id: string; count: number }) => [r._id, r.count]),
    );
  }
}
