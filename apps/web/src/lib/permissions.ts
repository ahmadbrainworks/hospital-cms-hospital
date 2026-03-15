import { Permission, UserRole } from "@hospital-cms/shared-types";
import { ROLE_PERMISSIONS } from "@hospital-cms/rbac";
import type { UserPublic } from "@hospital-cms/shared-types";

// CLIENT-SIDE PERMISSION HELPERS
// Mirror of server RBAC — used for conditional UI rendering.
// NEVER use these as the sole security check (server enforces).

export function hasPermission(
  user: UserPublic,
  permission: Permission,
): boolean {
  if (user.role === UserRole.SUPER_ADMIN) return true;
  const rolePerms = ROLE_PERMISSIONS[user.role] ?? [];
  return (
    rolePerms.includes(permission) || user.permissions.includes(permission)
  );
}

export function hasAnyPermission(
  user: UserPublic,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => hasPermission(user, p));
}

export function hasAllPermissions(
  user: UserPublic,
  permissions: Permission[],
): boolean {
  return permissions.every((p) => hasPermission(user, p));
}
