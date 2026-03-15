/**
 * Agent-local types.
 *
 * Wire types (DesiredState, ReconciliationSummary) are imported from
 * @hospital-cms/contracts. Only local-only types live here.
 */

export interface CommandRecord {
  commandId: string;
  instanceId: string;
  type: string;
  payload: Record<string, unknown>;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

export interface InstalledPackage {
  packageId: string;
  packageType: "plugin" | "theme" | "widget";
  version: string;
  status: "active" | "disabled" | "error";
}

export interface LocalState {
  desiredStateVersion: number;
  installedPackages: InstalledPackage[];
  lastHeartbeatAt: string | null;
  lastReconcileAt: string | null;
}
