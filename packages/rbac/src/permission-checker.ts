import { UserRole, Permission } from "@hospital-cms/shared-types";
import { ForbiddenError } from "@hospital-cms/errors";
import { ROLE_PERMISSIONS } from "./role-permissions";

// PERMISSION CHECKER
// Resolves effective permissions by merging role defaults
// with per-user grants. SUPER_ADMIN always passes.

export interface PermissionContext {
  userId: string;
  role: UserRole;
  permissions: Permission[]; // per-user overrides/additions
}

export function resolveEffectivePermissions(
  ctx: PermissionContext,
): Set<Permission> {
  if (ctx.role === UserRole.SUPER_ADMIN) {
    return new Set(Object.values(Permission));
  }

  const rolePerms = ROLE_PERMISSIONS[ctx.role] ?? [];
  const merged = new Set([...rolePerms, ...ctx.permissions]);
  return merged;
}

export function hasPermission(
  ctx: PermissionContext,
  required: Permission,
): boolean {
  if (ctx.role === UserRole.SUPER_ADMIN) return true;
  const effective = resolveEffectivePermissions(ctx);
  return effective.has(required);
}

export function hasAllPermissions(
  ctx: PermissionContext,
  required: Permission[],
): boolean {
  if (ctx.role === UserRole.SUPER_ADMIN) return true;
  const effective = resolveEffectivePermissions(ctx);
  return required.every((p) => effective.has(p));
}

export function hasAnyPermission(
  ctx: PermissionContext,
  required: Permission[],
): boolean {
  if (ctx.role === UserRole.SUPER_ADMIN) return true;
  const effective = resolveEffectivePermissions(ctx);
  return required.some((p) => effective.has(p));
}

export function assertPermission(
  ctx: PermissionContext,
  required: Permission,
): void {
  if (!hasPermission(ctx, required)) {
    throw new ForbiddenError(
      `Permission '${required}' is required to perform this action.`,
      { userId: ctx.userId, role: ctx.role, required },
    );
  }
}

export function assertAllPermissions(
  ctx: PermissionContext,
  required: Permission[],
): void {
  if (!hasAllPermissions(ctx, required)) {
    const missing = required.filter((p) => !hasPermission(ctx, p));
    throw new ForbiddenError(`Missing permissions: ${missing.join(", ")}`, {
      userId: ctx.userId,
      role: ctx.role,
      missing,
    });
  }
}

export function assertRole(
  ctx: PermissionContext,
  allowedRoles: UserRole[],
): void {
  if (!allowedRoles.includes(ctx.role)) {
    throw new ForbiddenError(
      `Role '${ctx.role}' is not allowed to perform this action.`,
      { userId: ctx.userId, role: ctx.role, allowedRoles },
    );
  }
}
