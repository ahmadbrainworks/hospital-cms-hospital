import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "../password";

describe("hashPassword", () => {
  it("produces a bcrypt hash", async () => {
    const hash = await hashPassword("Test@1234");
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it("produces unique hashes for same input", async () => {
    const h1 = await hashPassword("Test@1234");
    const h2 = await hashPassword("Test@1234");
    expect(h1).not.toBe(h2);
  });
});

describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const hash = await hashPassword("Correct@Pass1");
    expect(await verifyPassword("Correct@Pass1", hash)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("Correct@Pass1");
    expect(await verifyPassword("Wrong@Pass1", hash)).toBe(false);
  });
});

describe("validatePasswordStrength", () => {
  it("accepts strong password", () => {
    const result = validatePasswordStrength("StrongPass@123");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects password too short", () => {
    const result = validatePasswordStrength("Ab@1");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("8 characters"))).toBe(true);
  });

  it("rejects password without uppercase", () => {
    const result = validatePasswordStrength("lowercase@123");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("uppercase"))).toBe(true);
  });

  it("rejects password without special character", () => {
    const result = validatePasswordStrength("NoSpecial123");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("special character"))).toBe(
      true,
    );
  });
});
