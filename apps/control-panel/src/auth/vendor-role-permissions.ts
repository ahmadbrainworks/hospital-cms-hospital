/**
 * Vendor RBAC — role-to-permission map.
 *
 * Separate from the client CMS RBAC in packages/rbac/.
 * This is used by both the control panel backend and the vendor dashboard
 * frontend for role-aware rendering.
 */
import { VendorRole, VendorPermission } from "../types/vendor-auth";

const ALL_PERMISSIONS = Object.values(VendorPermission);

const ROLE_PERMISSIONS: Record<VendorRole, VendorPermission[]> = {
  [VendorRole.VENDOR_SUPER_ADMIN]: ALL_PERMISSIONS,

  [VendorRole.LICENSE_MANAGER]: [
    VendorPermission.LICENSE_VIEW,
    VendorPermission.LICENSE_CREATE,
    VendorPermission.LICENSE_UPDATE,
    VendorPermission.LICENSE_SUSPEND,
    VendorPermission.LICENSE_REVOKE,
    VendorPermission.INSTANCE_VIEW,
    VendorPermission.INSTANCE_VIEW_HEALTH,
    VendorPermission.MONITORING_VIEW,
    VendorPermission.COMMAND_VIEW,
    VendorPermission.TELEMETRY_VIEW,
    VendorPermission.ALERT_VIEW,
  ],

  [VendorRole.INSTANCE_MANAGER]: [
    VendorPermission.INSTANCE_VIEW,
    VendorPermission.INSTANCE_UPDATE,
    VendorPermission.INSTANCE_ASSIGN_PACKAGE,
    VendorPermission.INSTANCE_VIEW_HEALTH,
    VendorPermission.COMMAND_VIEW,
    VendorPermission.COMMAND_CREATE,
    VendorPermission.DESIRED_STATE_VIEW,
    VendorPermission.DESIRED_STATE_UPDATE,
    VendorPermission.MONITORING_VIEW,
    VendorPermission.LICENSE_VIEW,
    VendorPermission.TELEMETRY_VIEW,
    VendorPermission.PACKAGE_VIEW,
    VendorPermission.ALERT_VIEW,
    VendorPermission.ALERT_MANAGE,
    VendorPermission.ROLLOUT_VIEW,
    VendorPermission.FLAG_VIEW,
    VendorPermission.DIAGNOSTICS_REQUEST,
    VendorPermission.DIAGNOSTICS_VIEW,
  ],

  [VendorRole.SUPPORT_STAFF]: [
    VendorPermission.INSTANCE_VIEW,
    VendorPermission.INSTANCE_VIEW_HEALTH,
    VendorPermission.MONITORING_VIEW,
    VendorPermission.TELEMETRY_VIEW,
    VendorPermission.COMMAND_VIEW,
    VendorPermission.LICENSE_VIEW,
    VendorPermission.PACKAGE_VIEW,
    VendorPermission.AUDIT_VIEW,
    VendorPermission.ALERT_VIEW,
    VendorPermission.DIAGNOSTICS_REQUEST,
    VendorPermission.DIAGNOSTICS_VIEW,
  ],

  [VendorRole.PACKAGE_MANAGER]: [
    VendorPermission.PACKAGE_VIEW,
    VendorPermission.PACKAGE_CREATE,
    VendorPermission.PACKAGE_PUBLISH,
    VendorPermission.PACKAGE_ASSIGN,
    VendorPermission.PACKAGE_ROLLBACK,
    VendorPermission.INSTANCE_VIEW,
    VendorPermission.INSTANCE_ASSIGN_PACKAGE,
    VendorPermission.DESIRED_STATE_VIEW,
    VendorPermission.DESIRED_STATE_UPDATE,
    VendorPermission.COMMAND_VIEW,
    VendorPermission.ROLLOUT_VIEW,
    VendorPermission.ROLLOUT_MANAGE,
    VendorPermission.FLAG_VIEW,
    VendorPermission.FLAG_MANAGE,
  ],

  [VendorRole.AUDITOR]: [
    VendorPermission.AUDIT_VIEW,
    VendorPermission.INSTANCE_VIEW,
    VendorPermission.LICENSE_VIEW,
    VendorPermission.COMMAND_VIEW,
    VendorPermission.TELEMETRY_VIEW,
    VendorPermission.MONITORING_VIEW,
    VendorPermission.STAFF_VIEW,
    VendorPermission.PACKAGE_VIEW,
    VendorPermission.ALERT_VIEW,
    VendorPermission.ROLLOUT_VIEW,
    VendorPermission.FLAG_VIEW,
    VendorPermission.DIAGNOSTICS_VIEW,
  ],
};

/** Get all permissions for a role. */
export function getVendorRolePermissions(role: VendorRole): VendorPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Check if a role has a specific permission. */
export function hasVendorPermission(
  role: VendorRole,
  permission: VendorPermission,
): boolean {
  if (role === VendorRole.VENDOR_SUPER_ADMIN) return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Check against a resolved permissions array (from JWT payload). */
export function checkVendorPermission(
  permissions: VendorPermission[],
  required: VendorPermission,
): boolean {
  return permissions.includes(required);
}

/** Check if any of the required permissions are present. */
export function hasAnyVendorPermission(
  permissions: VendorPermission[],
  required: VendorPermission[],
): boolean {
  return required.some((p) => permissions.includes(p));
}

/** All defined roles. */
export const VENDOR_ROLES = Object.values(VendorRole);

/** Role-permission map export for frontend use. */
export { ROLE_PERMISSIONS as VENDOR_ROLE_PERMISSIONS };
