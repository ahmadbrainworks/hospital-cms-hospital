/**
 * Package assignment contract.
 *
 * Represents the vendor's assignment of a package (plugin, theme, widget)
 * to a specific hospital instance. The assignment is the entitlement gate —
 * a package cannot be installed on a hospital unless an assignment exists.
 */

export type PackageAssignmentStatus =
  | "assigned"         // Vendor assigned, not yet synced to hospital
  | "installing"       // Agent reported install in progress
  | "active"           // Agent confirmed installed and active
  | "disabled"         // Vendor disabled (still installed but deactivated)
  | "pending_update"   // Version change pending sync
  | "pending_removal"  // Removal pending sync
  | "removed"          // Agent confirmed removal
  | "failed";          // Agent reported installation/activation failure

export interface PackageAssignment {
  assignmentId: string;
  instanceId: string;
  packageId: string;
  packageType: "plugin" | "theme" | "widget";
  assignedVersion: string;
  status: PackageAssignmentStatus;
  assignedAt: string;            // ISO-8601
  assignedBy: string;            // staffId
  updatedAt: string;             // ISO-8601
  updatedBy: string;             // staffId
  lastSyncAt?: string;           // ISO-8601 — when agent last reported on this
  lastError?: string;            // Error message from last failed sync
  config?: Record<string, unknown>;
  notes?: string;
}

export interface AssignPackageRequest {
  instanceId: string;
  packageId: string;
  version: string;
  config?: Record<string, unknown>;
  notes?: string;
}

export interface BulkAssignPackageRequest {
  instanceIds: string[];
  packageId: string;
  version: string;
  config?: Record<string, unknown>;
  notes?: string;
}

export interface UpdateAssignmentVersionRequest {
  version: string;
}
