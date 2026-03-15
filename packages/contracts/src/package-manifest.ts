/**
 * Package manifest contract types.
 *
 * All packages (themes, plugins, widgets) distributed through the vendor
 * package registry share this base manifest shape. The agent verifies the
 * RSA-4096 signature before installing any package.
 */

import type { DesignTokens } from "./theme-tokens";

export type PackageType = "theme" | "plugin" | "widget";

/**
 * Compatibility rules embedded in every package manifest.
 * The agent enforces these before installation.
 */
export interface PackageCompatibility {
  /** Minimum CMS/agent version required (semver) */
  minCmsVersion: string;
  /** Maximum CMS/agent version supported (semver, inclusive) */
  maxCmsVersion?: string;
  /** License tiers that include this package */
  requiredLicenseTiers: string[];
  /** Feature flags that must be present in the active license lease */
  requiredFeatures: string[];
}

/** Base shape shared by all package types. */
export interface BasePackageManifest {
  packageId: string;
  type: PackageType;
  /** Semver string, e.g. "1.4.2" */
  version: string;
  name: string;
  description: string;
  author: string;

  /** Always true for packages issued by the vendor control-panel */
  vendorSigned: true;
  /**
   * RSA-4096 signature over the canonical JSON of this manifest
   * (signature field set to "" before signing).
   */
  signature: string;
  /** Identifies which vendor key pair signed this manifest */
  publicKeyId: string;
  /** SHA-256 hex digest of the package archive (.tar.gz) */
  checksum: string;

  compatibility: PackageCompatibility;

  /** Signed temporary download URL issued by the control-panel */
  downloadUrl: string;
  /** Archive size in bytes */
  size: number;

  publishedAt: string;  // ISO-8601
  releaseNotes?: string;

  /** packageId@version to revert to on rollback */
  rollbackTo?: string;
}

/** Manifest for a theme package. */
export interface ThemePackageManifest extends BasePackageManifest {
  type: "theme";
  /** Semantic design tokens defined by the vendor theme builder */
  tokens: DesignTokens;
  /** Pre-computed CSS variables for DaisyUI rendering */
  cssVariablesDaisyui: Record<string, string>;
  /** Pre-computed CSS variables for shadcn/ui rendering */
  cssVariablesShadcn: Record<string, string>;
  /** Optional fonts bundled with the theme */
  fonts?: ThemeFontEntry[];
  /** Logo asset path within the archive */
  logo?: string;
  /** Favicon asset path within the archive */
  favicon?: string;
}

export interface ThemeFontEntry {
  family: string;
  /** Path within the archive */
  path: string;
  weights: number[];
}

/** Database migration bundled with a package version. */
export interface PackageMigration {
  /** Unique migration ID (e.g., "001_add_patient_alerts_index") */
  migrationId: string;
  /** Version this migration was introduced in */
  version: string;
  /** JavaScript file within the archive that exports up() and down() */
  scriptPath: string;
  /** Human-readable description */
  description: string;
  /** Estimated duration for progress reporting */
  estimatedDurationMs: number;
}

/** Manifest for a plugin package. */
export interface PluginPackageManifest extends BasePackageManifest {
  type: "plugin";
  entryPoint: string;
  /** Fine-grained permissions the plugin may exercise via the sandbox API */
  permissions: string[];
  /** Express route handlers the plugin registers */
  routes: PluginRouteDeclaration[];
  /** Event bus events the plugin subscribes to */
  events: string[];
  /** Frontend slot IDs the plugin occupies */
  uiSlots: PluginUiSlotDeclaration[];
  /** Database migrations bundled with this version */
  migrations?: PackageMigration[];
}

export interface PluginRouteDeclaration {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  requiredPermission?: string;
  description: string;
}

export interface PluginUiSlotDeclaration {
  slotId: string;
  component: string;
  props?: Record<string, unknown>;
}

/** Manifest for a widget package. */
export interface WidgetPackageManifest extends BasePackageManifest {
  type: "widget";
  /** Layout zone the widget occupies (e.g. "dashboard.top", "sidebar.bottom") */
  zone: string;
  /** Whether the widget is enabled by default when assigned */
  defaultEnabled: boolean;
  /** Frontend component entry path within the archive */
  componentPath: string;
}

export type PackageManifest =
  | ThemePackageManifest
  | PluginPackageManifest
  | WidgetPackageManifest;

/**
 * Local record written to the hospital DB by the agent after
 * successfully installing a package.
 */
export interface InstalledPackageRecord {
  packageId: string;
  type: PackageType;
  version: string;
  name: string;
  installedAt: Date;
  installedBy: "agent";
  checksum: string;
  manifestSnapshot: PackageManifest;
  /** Absolute path on disk where the extracted archive lives */
  installPath: string;
  status: "active" | "disabled" | "failed" | "pending_removal";
  lastError?: string;
}
