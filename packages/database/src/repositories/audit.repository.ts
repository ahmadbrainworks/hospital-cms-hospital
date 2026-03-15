import { Db } from "mongodb";
import type { AuditLog, AuditAction } from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

export class AuditRepository extends BaseRepository<AuditLog> {
  constructor(db: Db) {
    super(db, COLLECTIONS.AUDIT_LOGS, "AuditLog");
  }

  // Audit logs are NEVER updated or deleted — only inserted.
  async logEvent(
    entry: Omit<AuditLog, "_id" | "createdAt" | "updatedAt">,
  ): Promise<WithStringId<AuditLog>> {
    return this.insertOne(entry);
  }

  async findByActor(
    hospitalId: string,
    userId: string,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany(
      { hospitalId, "actor.userId": userId },
      { ...opts, sort: { createdAt: -1 } },
    );
  }

  async findByResource(
    hospitalId: string,
    resourceType: string,
    resourceId: string,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany(
      {
        hospitalId,
        "resource.type": resourceType,
        "resource.id": resourceId,
      },
      { ...opts, sort: { createdAt: -1 } },
    );
  }

  async findByAction(
    hospitalId: string,
    action: AuditAction,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany(
      { hospitalId, action },
      { ...opts, sort: { createdAt: -1 } },
    );
  }

  async findByTraceId(traceId: string): Promise<WithStringId<AuditLog>[]> {
    const result = await this.findMany({ traceId });
    return result.items;
  }

  async getLatestEntry(
    hospitalId: string,
  ): Promise<WithStringId<AuditLog> | null> {
    return this.findOne({ hospitalId } as Parameters<typeof this.findOne>[0]);
  }
}
