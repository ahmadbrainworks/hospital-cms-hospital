/**
 * Desired-state builder service.
 *
 * Auto-generates the DesiredStateDocument for a hospital instance by reading
 * all active package assignments. Called automatically after every assignment
 * mutation so the agent picks up changes on the next heartbeat.
 */
import { Db } from "mongodb";
import { createLogger } from "@hospital-cms/logger";
import type {
  DesiredPackageEntry,
  DesiredStateDocument,
  PackageAssignment,
  PackageAssignmentStatus,
} from "@hospital-cms/contracts";
import { DesiredStateService } from "./desired-state.service";
import { CP_COLLECTIONS } from "../db";

const logger = createLogger({ module: "DesiredStateBuilder" });

/** Statuses that represent a package the instance should have. */
const INSTALL_STATUSES: PackageAssignmentStatus[] = [
  "assigned",
  "installing",
  "active",
  "pending_update",
  "failed", // retry on next sync
];

/** Statuses that represent a package that should be removed. */
const REMOVE_STATUSES: PackageAssignmentStatus[] = [
  "disabled",
  "pending_removal",
];

export class DesiredStateBuilderService {
  constructor(
    private readonly db: Db,
    private readonly desiredStateService: DesiredStateService,
  ) {}

  /**
   * Rebuild the desired state for an instance from its package assignments.
   * Preserves existing config and featureFlags — only replaces the packages array.
   */
  async rebuild(instanceId: string): Promise<DesiredStateDocument> {
    const assignments = await this.db
      .collection<PackageAssignment>(CP_COLLECTIONS.PACKAGE_ASSIGNMENTS)
      .find({
        instanceId,
        status: { $in: [...INSTALL_STATUSES, ...REMOVE_STATUSES] },
      })
      .toArray();

    const packages: DesiredPackageEntry[] = assignments.map((a) => {
      if (REMOVE_STATUSES.includes(a.status)) {
        return { packageId: a.packageId, action: "remove" as const };
      }
      if (a.status === "active") {
        // Already installed — pin to current version
        return {
          packageId: a.packageId,
          version: a.assignedVersion,
          action: "pin" as const,
        };
      }
      // assigned, installing, pending_update, failed → install/update
      return {
        packageId: a.packageId,
        version: a.assignedVersion,
        action: "install" as const,
      };
    });

    const state = await this.desiredStateService.publish(instanceId, { packages });

    logger.info(
      {
        instanceId,
        version: state.version,
        packageCount: packages.length,
      },
      "Desired state rebuilt from assignments",
    );

    return state;
  }
}
