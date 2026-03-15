/**
 * Vendor-level audit log.
 *
 * Records sensitive control-plane operations (license issuance, command
 * dispatch, instance registration) to the cp_audit_log collection so
 * vendors have an immutable record of all actions taken.
 */
import { Db } from "mongodb";
import { createLogger } from "@hospital-cms/logger";
import { CP_COLLECTIONS } from "../db";

const logger = createLogger({ module: "VendorAudit" });

export interface VendorAuditEntry {
  action: string;
  instanceId: string | undefined;
  actorNote: string | undefined;
  detail: Record<string, unknown>;
  timestamp: Date;
}

export class VendorAuditService {
  constructor(private readonly db: Db) {}

  private col() {
    return this.db.collection<VendorAuditEntry>(CP_COLLECTIONS.AUDIT_LOG);
  }

  /** Fire-and-forget — never blocks the caller. */
  log(
    action: string,
    detail: Record<string, unknown>,
    instanceId?: string,
    actorNote?: string,
  ): void {
    const entry: VendorAuditEntry = {
      action,
      instanceId: instanceId,
      actorNote: actorNote,
      detail,
      timestamp: new Date(),
    };

    this.col()
      .insertOne(entry)
      .catch((e: unknown) => logger.warn({ err: e, action }, "Failed to write vendor audit entry"));
  }
}
