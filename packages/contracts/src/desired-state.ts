/**
 * Desired-state contract.
 *
 * The vendor control-panel publishes a DesiredState document for each
 * registered instance.  The agent fetches this on every heartbeat cycle
 * and reconciles the local system to match.
 */

export type DesiredPackageAction = "install" | "update" | "remove" | "pin";

export interface DesiredPackageEntry {
  packageId: string;
  /** Target version (semver).  Omitted for "remove" actions. */
  version?: string;
  action: DesiredPackageAction;
}

export type DesiredConfigValue = string | number | boolean | null;

export interface DesiredStateDocument {
  /** Monotonically increasing version; agent ignores older documents */
  version: number;

  /** ISO-8601 timestamp when this state was published */
  publishedAt: string;

  /** Packages the instance should have installed */
  packages: DesiredPackageEntry[];

  /**
   * Key/value config overrides the agent should write to the local
   * hospital config (only the keys listed here are touched).
   */
  config: Record<string, DesiredConfigValue>;

  /**
   * Feature flags the control-panel wants active/inactive.
   * The license guard reads these from res.locals.license.features.
   */
  featureFlags: Record<string, boolean>;

  /**
   * Maintenance window.  When set, the agent schedules any disruptive
   * operations (package upgrades, restarts) for this window.
   */
  maintenanceWindow?: {
    startAt: string;   // ISO-8601
    endAt: string;     // ISO-8601
  };
}

/**
 * Wire format: DesiredPackageEntry enriched with download metadata.
 * The control-panel populates these fields from the package registry
 * before sending to the agent via the heartbeat response.
 */
export interface EnrichedDesiredPackageEntry extends DesiredPackageEntry {
  packageType: "plugin" | "theme" | "widget";
  downloadUrl: string;
  checksum: string;
  manifestSignature: string;
}

/**
 * Wire format: DesiredStateDocument with enriched package entries.
 * This is what the agent actually receives in the heartbeat response.
 */
export interface EnrichedDesiredStateDocument
  extends Omit<DesiredStateDocument, "packages"> {
  packages: EnrichedDesiredPackageEntry[];
}

/**
 * Reconciliation summary written back to the control-panel
 * as part of the next heartbeat payload.
 */
export interface ReconciliationSummary {
  appliedStateVersion: number;
  completedAt: string;     // ISO-8601
  packagesInstalled: string[];
  packagesRemoved: string[];
  packagesFailed: Array<{ packageId: string; error: string }>;
  configKeysApplied: string[];
  errors: string[];
}
