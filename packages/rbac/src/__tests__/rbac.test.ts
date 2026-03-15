import { describe, it, expect } from "vitest";
import { UserRole, Permission } from "@hospital-cms/shared-types";
import {
  hasPermission,
  hasAllPermissions,
  assertPermission,
  resolveEffectivePermissions,
  getDefaultPermissionsForRole,
} from "../index";
import { ForbiddenError } from "@hospital-cms/errors";

const makeCtx = (role: UserRole, extra: Permission[] = []) => ({
  userId: "user-001",
  role,
  permissions: extra,
});

describe("SUPER_ADMIN", () => {
  it("has all permissions", () => {
    const ctx = makeCtx(UserRole.SUPER_ADMIN);
    expect(hasPermission(ctx, Permission.AUDIT_EXPORT)).toBe(true);
    expect(hasPermission(ctx, Permission.SYSTEM_KEYS_ROTATE)).toBe(true);
    expect(hasPermission(ctx, Permission.PATIENT_DELETE)).toBe(true);
  });
});

describe("DOCTOR", () => {
  it("can prescribe", () => {
    const ctx = makeCtx(UserRole.DOCTOR);
    expect(hasPermission(ctx, Permission.PHARMACY_PRESCRIBE)).toBe(true);
  });

  it("cannot dispense pharmacy", () => {
    const ctx = makeCtx(UserRole.DOCTOR);
    expect(hasPermission(ctx, Permission.PHARMACY_DISPENSE)).toBe(false);
  });

  it("cannot manage plugins", () => {
    const ctx = makeCtx(UserRole.DOCTOR);
    expect(hasPermission(ctx, Permission.SYSTEM_PLUGINS_MANAGE)).toBe(false);
  });

  it("cannot void billing", () => {
    const ctx = makeCtx(UserRole.DOCTOR);
    expect(hasPermission(ctx, Permission.BILLING_VOID)).toBe(false);
  });
});

describe("RECEPTIONIST", () => {
  it("can create patients", () => {
    const ctx = makeCtx(UserRole.RECEPTIONIST);
    expect(hasPermission(ctx, Permission.PATIENT_CREATE)).toBe(true);
  });

  it("cannot read sensitive patient data", () => {
    const ctx = makeCtx(UserRole.RECEPTIONIST);
    expect(hasPermission(ctx, Permission.PATIENT_READ_SENSITIVE)).toBe(false);
  });
});

describe("per-user permission grants", () => {
  it("grants extra permission on top of role", () => {
    const ctx = makeCtx(UserRole.RECEPTIONIST, [Permission.AUDIT_READ]);
    expect(hasPermission(ctx, Permission.AUDIT_READ)).toBe(true);
  });
});

describe("hasAllPermissions", () => {
  it("returns true when all required", () => {
    const ctx = makeCtx(UserRole.HOSPITAL_ADMIN);
    expect(
      hasAllPermissions(ctx, [
        Permission.PATIENT_READ,
        Permission.BILLING_READ,
      ]),
    ).toBe(true);
  });

  it("returns false if any missing", () => {
    const ctx = makeCtx(UserRole.DOCTOR);
    expect(
      hasAllPermissions(ctx, [
        Permission.PATIENT_READ,
        Permission.BILLING_VOID, // doctor doesn't have this
      ]),
    ).toBe(false);
  });
});

describe("assertPermission", () => {
  it("throws ForbiddenError when permission missing", () => {
    const ctx = makeCtx(UserRole.READONLY);
    expect(() => assertPermission(ctx, Permission.PATIENT_CREATE)).toThrow(
      ForbiddenError,
    );
  });

  it("does not throw when permission present", () => {
    const ctx = makeCtx(UserRole.DOCTOR);
    expect(() => assertPermission(ctx, Permission.PATIENT_READ)).not.toThrow();
  });
});

describe("resolveEffectivePermissions", () => {
  it("returns a Set", () => {
    const ctx = makeCtx(UserRole.NURSE);
    const perms = resolveEffectivePermissions(ctx);
    expect(perms).toBeInstanceOf(Set);
    expect(perms.has(Permission.PATIENT_READ)).toBe(true);
  });
});

describe("READONLY role", () => {
  it("can only read", () => {
    const ctx = makeCtx(UserRole.READONLY);
    expect(hasPermission(ctx, Permission.PATIENT_READ)).toBe(true);
    expect(hasPermission(ctx, Permission.PATIENT_CREATE)).toBe(false);
    expect(hasPermission(ctx, Permission.BILLING_CREATE)).toBe(false);
  });
});
