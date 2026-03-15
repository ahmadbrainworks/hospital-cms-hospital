/**
 * Frontend permission constants mirroring VendorPermission enum.
 *
 * These are the same string values as the backend — kept as plain
 * constants to avoid pulling in backend code or shared-types.
 */
export const P = {
  // License
  LICENSE_VIEW: "license:view",
  LICENSE_CREATE: "license:create",
  LICENSE_UPDATE: "license:update",
  LICENSE_SUSPEND: "license:suspend",
  LICENSE_REVOKE: "license:revoke",

  // Instance
  INSTANCE_VIEW: "instance:view",
  INSTANCE_UPDATE: "instance:update",
  INSTANCE_ASSIGN_PACKAGE: "instance:assign-package",
  INSTANCE_VIEW_HEALTH: "instance:view-health",

  // Monitoring & audit
  MONITORING_VIEW: "monitoring:view",
  AUDIT_VIEW: "audit:view",

  // Packages
  PACKAGE_VIEW: "package:view",
  PACKAGE_CREATE: "package:create",
  PACKAGE_PUBLISH: "package:publish",
  PACKAGE_ASSIGN: "package:assign",
  PACKAGE_ROLLBACK: "package:rollback",

  // Staff management
  STAFF_VIEW: "staff:view",
  STAFF_CREATE: "staff:create",
  STAFF_UPDATE: "staff:update",
  ROLE_VIEW: "role:view",
  ROLE_UPDATE: "role:update",

  // Settings
  SETTINGS_VIEW: "settings:view",
  SETTINGS_UPDATE: "settings:update",

  // Commands
  COMMAND_VIEW: "command:view",
  COMMAND_CREATE: "command:create",

  // Telemetry
  TELEMETRY_VIEW: "telemetry:view",

  // Desired state
  DESIRED_STATE_VIEW: "desired-state:view",
  DESIRED_STATE_UPDATE: "desired-state:update",
} as const;

export type Permission = (typeof P)[keyof typeof P];
