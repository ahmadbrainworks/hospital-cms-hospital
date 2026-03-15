import type { GuardDef, GuardResult, TransitionContext } from "./types";
import { hasPermission } from "@hospital-cms/rbac";
import type { Permission, UserRole } from "@hospital-cms/shared-types";

// GUARD EXECUTOR
// Guards are evaluated before a transition is allowed.
// All guards must pass for the transition to proceed.

export function evaluateGuard(
  guard: GuardDef,
  ctx: TransitionContext,
  entity?: Record<string, unknown>,
): GuardResult {
  switch (guard.type) {
    case "permission_check": {
      const required = guard.config["permission"] as Permission;
      const permCtx = {
        userId: ctx.performedByUserId,
        role: ctx.performedByRole as UserRole,
        permissions: ctx.permissions,
      };
      if (!hasPermission(permCtx, required)) {
        return {
          passed: false,
          failureReason: `Permission '${required}' is required for this transition.`,
        };
      }
      return { passed: true };
    }

    case "field_required": {
      const field = guard.config["field"] as string;
      const value = entity?.[field];
      if (value === undefined || value === null || value === "") {
        return {
          passed: false,
          failureReason: `Field '${field}' must be set before this transition.`,
        };
      }
      return { passed: true };
    }

    case "entity_field_truthy": {
      const field = guard.config["field"] as string;
      const expected = guard.config["value"];
      const actual = entity?.[field];
      if (expected !== undefined ? actual !== expected : !actual) {
        return {
          passed: false,
          failureReason:
            (guard.config["message"] as string) ??
            `Entity field '${field}' did not meet the required condition.`,
        };
      }
      return { passed: true };
    }

    default:
      return {
        passed: false,
        failureReason: `Unknown guard type: ${(guard as GuardDef).type}`,
      };
  }
}

export function evaluateAllGuards(
  guards: GuardDef[],
  ctx: TransitionContext,
  entity?: Record<string, unknown>,
): GuardResult {
  for (const guard of guards) {
    const result = evaluateGuard(guard, ctx, entity);
    if (!result.passed) return result;
  }
  return { passed: true };
}
