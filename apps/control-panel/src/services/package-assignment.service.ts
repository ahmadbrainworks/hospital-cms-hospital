/**
 * Package assignment service.
 *
 * Manages the assignment of packages (plugins, themes, widgets) to hospital
 * instances. Every mutation auto-rebuilds the desired state for the affected
 * instance so the agent picks up changes on the next heartbeat.
 */
import { Db } from "mongodb";
import { randomUUID } from "crypto";
import { createLogger } from "@hospital-cms/logger";
import { NotFoundError, ConflictError, ValidationError } from "@hospital-cms/errors";
import type {
  PackageAssignment,
  PackageAssignmentStatus,
  ReconciliationSummary,
} from "@hospital-cms/contracts";
import { CP_COLLECTIONS } from "../db";
import type { DesiredStateBuilderService } from "./desired-state-builder.service";
import type { PackageRegistryService, StoredPackage } from "./package-registry.service";

const logger = createLogger({ module: "PackageAssignmentService" });

interface AssignmentDocument extends PackageAssignment {
  _id?: unknown;
}

export class PackageAssignmentService {
  constructor(
    private readonly db: Db,
    private readonly desiredStateBuilder: DesiredStateBuilderService,
    private readonly packageRegistry: PackageRegistryService,
  ) {}

  private col() {
    return this.db.collection<AssignmentDocument>(CP_COLLECTIONS.PACKAGE_ASSIGNMENTS);
  }

  private auditCol() {
    return this.db.collection(CP_COLLECTIONS.PACKAGE_AUDIT);
  }

  /**
   * Assign a package to a hospital instance.
   * For themes: automatically disables any existing active theme assignment.
   */
  async assign(
    instanceId: string,
    packageId: string,
    version: string,
    staffId: string,
    opts?: { config?: Record<string, unknown>; notes?: string },
  ): Promise<PackageAssignment> {
    // Validate package exists and version is available
    const pkg = await this.validatePackageVersion(packageId, version);

    // Check for duplicate assignment
    const existing = await this.col().findOne({ instanceId, packageId });
    if (existing && existing.status !== "removed") {
      throw new ConflictError(
        `Package ${packageId} is already assigned to instance ${instanceId} (status: ${existing.status})`,
      );
    }

    // Theme exclusivity: disable any existing active theme
    if (pkg.type === "theme") {
      await this.disableExistingTheme(instanceId, staffId);
    }

    const now = new Date().toISOString();
    const assignment: AssignmentDocument = {
      assignmentId: randomUUID(),
      instanceId,
      packageId,
      packageType: pkg.type as "plugin" | "theme" | "widget",
      assignedVersion: version,
      status: "assigned",
      assignedAt: now,
      assignedBy: staffId,
      updatedAt: now,
      updatedBy: staffId,
      config: opts?.config,
      notes: opts?.notes,
    };

    if (existing && existing.status === "removed") {
      // Re-assign: update the existing removed record
      await this.col().updateOne(
        { instanceId, packageId },
        { $set: { ...assignment, assignmentId: existing.assignmentId } },
      );
      assignment.assignmentId = existing.assignmentId;
    } else {
      await this.col().insertOne(assignment as any);
    }

    this.logAudit("assignment.created", packageId, staffId, instanceId, {
      version,
      packageType: pkg.type,
    });

    // Rebuild desired state
    await this.desiredStateBuilder.rebuild(instanceId);

    logger.info({ instanceId, packageId, version }, "Package assigned");
    return assignment;
  }

  /**
   * Assign a package to multiple hospital instances at once.
   */
  async bulkAssign(
    instanceIds: string[],
    packageId: string,
    version: string,
    staffId: string,
    opts?: { config?: Record<string, unknown>; notes?: string },
  ): Promise<PackageAssignment[]> {
    const results: PackageAssignment[] = [];
    const errors: Array<{ instanceId: string; error: string }> = [];

    for (const instanceId of instanceIds) {
      try {
        const assignment = await this.assign(instanceId, packageId, version, staffId, opts);
        results.push(assignment);
      } catch (err: any) {
        errors.push({ instanceId, error: err.message ?? "Unknown error" });
        logger.warn({ instanceId, packageId, err }, "Bulk assign failed for instance");
      }
    }

    this.logAudit("assignment.bulk_created", packageId, staffId, undefined, {
      version,
      totalRequested: instanceIds.length,
      totalSucceeded: results.length,
      errors,
    });

    return results;
  }

  /**
   * Update the assigned version for an existing assignment.
   */
  async updateVersion(
    instanceId: string,
    packageId: string,
    newVersion: string,
    staffId: string,
  ): Promise<PackageAssignment> {
    await this.validatePackageVersion(packageId, newVersion);

    const existing = await this.col().findOne({ instanceId, packageId });
    if (!existing || existing.status === "removed") {
      throw new NotFoundError(`No active assignment for ${packageId} on instance ${instanceId}`);
    }

    const oldVersion = existing.assignedVersion;
    const now = new Date().toISOString();

    await this.col().updateOne(
      { instanceId, packageId },
      {
        $set: {
          assignedVersion: newVersion,
          status: "pending_update" as PackageAssignmentStatus,
          updatedAt: now,
          updatedBy: staffId,
          lastError: undefined,
        },
      },
    );

    this.logAudit("assignment.version_updated", packageId, staffId, instanceId, {
      oldVersion,
      newVersion,
    });

    await this.desiredStateBuilder.rebuild(instanceId);

    logger.info({ instanceId, packageId, oldVersion, newVersion }, "Assignment version updated");
    return { ...existing, assignedVersion: newVersion, status: "pending_update", updatedAt: now, updatedBy: staffId };
  }

  /**
   * Disable a package assignment (keeps installed but deactivated).
   */
  async disable(
    instanceId: string,
    packageId: string,
    staffId: string,
  ): Promise<void> {
    const existing = await this.col().findOne({ instanceId, packageId });
    if (!existing || existing.status === "removed") {
      throw new NotFoundError(`No active assignment for ${packageId} on instance ${instanceId}`);
    }

    await this.col().updateOne(
      { instanceId, packageId },
      {
        $set: {
          status: "disabled" as PackageAssignmentStatus,
          updatedAt: new Date().toISOString(),
          updatedBy: staffId,
        },
      },
    );

    this.logAudit("assignment.disabled", packageId, staffId, instanceId, {});

    await this.desiredStateBuilder.rebuild(instanceId);

    logger.info({ instanceId, packageId }, "Assignment disabled");
  }

  /**
   * Remove a package assignment (triggers uninstall on next sync).
   */
  async remove(
    instanceId: string,
    packageId: string,
    staffId: string,
  ): Promise<void> {
    const existing = await this.col().findOne({ instanceId, packageId });
    if (!existing || existing.status === "removed") {
      throw new NotFoundError(`No active assignment for ${packageId} on instance ${instanceId}`);
    }

    await this.col().updateOne(
      { instanceId, packageId },
      {
        $set: {
          status: "pending_removal" as PackageAssignmentStatus,
          updatedAt: new Date().toISOString(),
          updatedBy: staffId,
        },
      },
    );

    this.logAudit("assignment.removed", packageId, staffId, instanceId, {});

    await this.desiredStateBuilder.rebuild(instanceId);

    logger.info({ instanceId, packageId }, "Assignment marked for removal");
  }

  /**
   * Get all assignments for a hospital instance.
   */
  async getForInstance(
    instanceId: string,
    includeRemoved = false,
  ): Promise<PackageAssignment[]> {
    const filter: Record<string, unknown> = { instanceId };
    if (!includeRemoved) {
      filter["status"] = { $ne: "removed" };
    }
    return this.col()
      .find(filter)
      .sort({ assignedAt: -1 })
      .toArray();
  }

  /**
   * Get all hospital assignments for a specific package.
   */
  async getForPackage(
    packageId: string,
    includeRemoved = false,
  ): Promise<PackageAssignment[]> {
    const filter: Record<string, unknown> = { packageId };
    if (!includeRemoved) {
      filter["status"] = { $ne: "removed" };
    }
    return this.col()
      .find(filter)
      .sort({ assignedAt: -1 })
      .toArray();
  }

  /**
   * Count active assignments for a package (for dashboard stats).
   */
  async countActiveForPackage(packageId: string): Promise<number> {
    return this.col().countDocuments({
      packageId,
      status: { $in: ["assigned", "installing", "active", "pending_update"] },
    });
  }

  /**
   * Get a single assignment.
   */
  async getAssignment(
    instanceId: string,
    packageId: string,
  ): Promise<PackageAssignment | null> {
    return this.col().findOne({ instanceId, packageId });
  }

  /**
   * Process reconciliation summary from agent heartbeat.
   * Updates assignment statuses based on what the agent actually did.
   */
  async processReconciliation(
    instanceId: string,
    summary: ReconciliationSummary,
  ): Promise<void> {
    const now = new Date().toISOString();

    // Packages successfully installed → active
    for (const pkgRef of summary.packagesInstalled) {
      // pkgRef may be "packageId@version" or just "packageId"
      const packageId = pkgRef.split("@")[0]!;
      await this.col().updateOne(
        { instanceId, packageId, status: { $in: ["assigned", "installing", "pending_update"] } },
        { $set: { status: "active" as PackageAssignmentStatus, lastSyncAt: now, lastError: undefined } },
      );
      this.logAudit("sync.success", packageId, "agent", instanceId, { version: pkgRef });
    }

    // Packages successfully removed → removed
    for (const pkgRef of summary.packagesRemoved) {
      const packageId = pkgRef.split("@")[0]!;
      await this.col().updateOne(
        { instanceId, packageId, status: { $in: ["pending_removal", "disabled"] } },
        { $set: { status: "removed" as PackageAssignmentStatus, lastSyncAt: now } },
      );
      this.logAudit("sync.success", packageId, "agent", instanceId, { action: "removed" });
    }

    // Packages that failed → failed
    for (const fail of summary.packagesFailed) {
      const packageId = fail.packageId.split("@")[0]!;
      await this.col().updateOne(
        { instanceId, packageId },
        { $set: { status: "failed" as PackageAssignmentStatus, lastSyncAt: now, lastError: fail.error } },
      );
      this.logAudit("sync.failed", packageId, "agent", instanceId, { error: fail.error });
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private async validatePackageVersion(
    packageId: string,
    version: string,
  ): Promise<StoredPackage> {
    const versions = await this.packageRegistry.listVersions(packageId);
    const target = versions.find((v) => v.version === version && !v.yanked);
    if (!target) {
      throw new NotFoundError(`Package ${packageId}@${version} not found or yanked`);
    }
    return target;
  }

  private async disableExistingTheme(
    instanceId: string,
    staffId: string,
  ): Promise<void> {
    const existing = await this.col().findOne({
      instanceId,
      packageType: "theme",
      status: { $in: ["assigned", "active", "installing", "pending_update"] },
    });
    if (existing) {
      await this.col().updateOne(
        { instanceId, packageId: existing.packageId },
        {
          $set: {
            status: "pending_removal" as PackageAssignmentStatus,
            updatedAt: new Date().toISOString(),
            updatedBy: staffId,
          },
        },
      );
      logger.info(
        { instanceId, oldTheme: existing.packageId },
        "Existing theme assignment displaced by new theme",
      );
    }
  }

  private logAudit(
    action: string,
    packageId: string,
    staffId: string,
    instanceId?: string,
    detail: Record<string, unknown> = {},
  ): void {
    this.auditCol()
      .insertOne({
        eventId: randomUUID(),
        action,
        packageId,
        instanceId,
        staffId,
        detail,
        timestamp: new Date(),
      })
      .catch((e: unknown) =>
        logger.warn({ err: e, action }, "Failed to write package audit entry"),
      );
  }
}
