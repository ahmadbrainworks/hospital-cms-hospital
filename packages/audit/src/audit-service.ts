import type {
  AuditAction,
  AuditActor,
  AuditChanges,
  AuditLog,
  AuditResource,
} from "@hospital-cms/shared-types";
import { AuditRepository } from "@hospital-cms/database";
import { computeAuditHash } from "@hospital-cms/crypto";
import { logger } from "@hospital-cms/logger";
import type { WithStringId } from "@hospital-cms/database";

// AUDIT SERVICE
// Healthcare-grade immutable audit logging.
//
// Every log entry includes:
//  - a chained integrity hash (SHA-256 of entry + prev hash)
//  - structured actor/action/resource model
//  - outcome (SUCCESS / FAILURE)
//  - timestamp, IP, userAgent, sessionId, traceId
//
// The hash chain makes it detectable if entries are tampered.
// Audit logs are never updated or deleted.

const log = logger("audit:service");

export interface AuditEventParams {
  hospitalId: string;
  traceId: string;
  action: AuditAction;
  actor: AuditActor;
  resource: AuditResource;
  changes?: AuditChanges;
  outcome: "SUCCESS" | "FAILURE";
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  private readonly repo: AuditRepository;

  constructor(db: ConstructorParameters<typeof AuditRepository>[0]) {
    this.repo = new AuditRepository(db);
  }

  async log(params: AuditEventParams): Promise<void> {
    try {
      // Fetch previous hash for this hospital to chain entries
      const latest = await this.repo.getLatestEntry(params.hospitalId);
      const previousHash = latest?.integrityHash;

      const entryData = JSON.stringify({
        hospitalId: params.hospitalId,
        traceId: params.traceId,
        action: params.action,
        actor: params.actor,
        resource: params.resource,
        outcome: params.outcome,
        timestamp: new Date().toISOString(),
      });

      const integrityHash = computeAuditHash(entryData, previousHash);

      const entry = {
        hospitalId: params.hospitalId,
        traceId: params.traceId,
        action: params.action,
        actor: params.actor,
        resource: params.resource,
        outcome: params.outcome,
        integrityHash,
        ...(params.changes !== undefined && { changes: params.changes }),
        ...(params.failureReason !== undefined && {
          failureReason: params.failureReason,
        }),
        ...(params.ipAddress !== undefined && { ipAddress: params.ipAddress }),
        ...(params.userAgent !== undefined && { userAgent: params.userAgent }),
        ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
        ...(params.metadata !== undefined && { metadata: params.metadata }),
        ...(previousHash !== undefined && { previousHash }),
      } satisfies Omit<AuditLog, "_id" | "createdAt" | "updatedAt">;

      await this.repo.logEvent(entry);
    } catch (err) {
      // Audit logging MUST NOT fail the business operation.
      // Log the failure internally but never throw.
      log.error(
        { err, action: params.action, traceId: params.traceId },
        "Failed to write audit log entry",
      );
    }
  }

  async search(hospitalId: string, query: AuditSearchQuery) {
    const pagination = {
      ...(query.page !== undefined && { page: query.page }),
      ...(query.limit !== undefined && { limit: query.limit }),
    };

    if (query.actorId) {
      return this.repo.findByActor(hospitalId, query.actorId, pagination);
    }
    if (query.resourceType && query.resourceId) {
      return this.repo.findByResource(
        hospitalId,
        query.resourceType,
        query.resourceId,
        pagination,
      );
    }
    if (query.action) {
      return this.repo.findByAction(hospitalId, query.action, pagination);
    }
    // Default: all for hospital, newest first
    return this.repo.findMany(
      { hospitalId } as Parameters<typeof this.repo.findMany>[0],
      { ...pagination, sort: { createdAt: -1 } },
    );
  }

  async verifyChainIntegrity(
    hospitalId: string,
  ): Promise<{ valid: boolean; firstInvalidEntry?: string }> {
    const batchSize = 100;
    let page = 1;
    let prevHash: string | undefined;
    let firstInvalidEntry: string | undefined;

    while (true) {
      const result = await this.repo.findMany(
        { hospitalId } as Parameters<typeof this.repo.findMany>[0],
        { page, limit: batchSize, sort: { createdAt: 1 } },
      );

      for (const entry of result.items) {
        const entryData = JSON.stringify({
          hospitalId: entry.hospitalId,
          traceId: entry.traceId,
          action: entry.action,
          actor: entry.actor,
          resource: entry.resource,
          outcome: entry.outcome,
          timestamp: (entry as WithStringId<AuditLog>).createdAt.toISOString(),
        });

        const expectedHash = computeAuditHash(entryData, prevHash);
        if (expectedHash !== entry.integrityHash) {
          firstInvalidEntry = entry._id;
          return { valid: false, firstInvalidEntry };
        }
        prevHash = entry.integrityHash;
      }

      if (result.page >= result.totalPages) break;
      page++;
    }

    return { valid: true };
  }
}

export interface AuditSearchQuery {
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: AuditAction;
  page?: number;
  limit?: number;
}
