/**
 * Vendor control panel authentication types.
 *
 * Completely separate from client CMS auth — own roles, permissions,
 * collections, and JWT secrets.
 */

// ─── Roles ──────────────────────────────────────────────────────────

export enum VendorRole {
  VENDOR_SUPER_ADMIN = "VENDOR_SUPER_ADMIN",
  LICENSE_MANAGER = "LICENSE_MANAGER",
  INSTANCE_MANAGER = "INSTANCE_MANAGER",
  SUPPORT_STAFF = "SUPPORT_STAFF",
  PACKAGE_MANAGER = "PACKAGE_MANAGER",
  AUDITOR = "AUDITOR",
}

// ─── Permissions ────────────────────────────────────────────────────

export enum VendorPermission {
  // License
  LICENSE_VIEW = "license:view",
  LICENSE_CREATE = "license:create",
  LICENSE_UPDATE = "license:update",
  LICENSE_SUSPEND = "license:suspend",
  LICENSE_REVOKE = "license:revoke",

  // Instance
  INSTANCE_VIEW = "instance:view",
  INSTANCE_UPDATE = "instance:update",
  INSTANCE_ASSIGN_PACKAGE = "instance:assign-package",
  INSTANCE_VIEW_HEALTH = "instance:view-health",

  // Monitoring & audit
  MONITORING_VIEW = "monitoring:view",
  AUDIT_VIEW = "audit:view",

  // Packages (plugins, themes, widgets)
  PACKAGE_VIEW = "package:view",
  PACKAGE_CREATE = "package:create",
  PACKAGE_PUBLISH = "package:publish",
  PACKAGE_ASSIGN = "package:assign",
  PACKAGE_ROLLBACK = "package:rollback",

  // Staff management
  STAFF_VIEW = "staff:view",
  STAFF_CREATE = "staff:create",
  STAFF_UPDATE = "staff:update",
  ROLE_VIEW = "role:view",
  ROLE_UPDATE = "role:update",

  // Settings
  SETTINGS_VIEW = "settings:view",
  SETTINGS_UPDATE = "settings:update",

  // Commands
  COMMAND_VIEW = "command:view",
  COMMAND_CREATE = "command:create",

  // Telemetry
  TELEMETRY_VIEW = "telemetry:view",

  // Desired state
  DESIRED_STATE_VIEW = "desired-state:view",
  DESIRED_STATE_UPDATE = "desired-state:update",

  // Alerts
  ALERT_VIEW = "alert:view",
  ALERT_MANAGE = "alert:manage",

  // Rollouts
  ROLLOUT_VIEW = "rollout:view",
  ROLLOUT_MANAGE = "rollout:manage",

  // Feature flags
  FLAG_VIEW = "flag:view",
  FLAG_MANAGE = "flag:manage",

  // Diagnostics
  DIAGNOSTICS_REQUEST = "diagnostics:request",
  DIAGNOSTICS_VIEW = "diagnostics:view",
}

// ─── Staff status ───────────────────────────────────────────────────

export enum VendorStaffStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
  LOCKED = "locked",
}

// ─── Documents ──────────────────────────────────────────────────────

export interface StaffDocument {
  _id?: any;
  staffId: string;
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: VendorRole;
  status: VendorStaffStatus;
  failedLoginAttempts: number;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/** Excludes passwordHash — safe for API responses. */
export type StaffPublic = Omit<StaffDocument, "passwordHash" | "_id">;

export interface StaffSessionDocument {
  _id?: any;
  sessionId: string;
  staffId: string;
  refreshTokenHash: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt?: Date;
}

export interface StaffAuditEntry {
  _id?: any;
  staffId: string;
  staffEmail: string;
  action: string;
  detail: Record<string, unknown>;
  ipAddress: string;
  timestamp: Date;
}

// ─── JWT payloads ───────────────────────────────────────────────────

export interface VendorAccessTokenPayload {
  sub: string; // staffId
  email: string;
  username: string;
  displayName: string;
  role: VendorRole;
  permissions: VendorPermission[];
  sessionId: string;
  type: "vendor_access";
}

export interface VendorRefreshTokenPayload {
  sub: string; // staffId
  sessionId: string;
  type: "vendor_refresh";
}

// ─── Request context augmentation ───────────────────────────────────

export interface VendorStaffContext {
  staffId: string;
  email: string;
  username: string;
  displayName: string;
  role: VendorRole;
  permissions: VendorPermission[];
  sessionId: string;
}
