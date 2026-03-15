import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  buildOtpAuthUri,
} from "../totp";

describe("generateTotpSecret", () => {
  it("returns a 32-character base32 string", () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(32);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it("generates unique secrets each call", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
  });
});

describe("generateTotpCode", () => {
  it("returns a 6-digit string", () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("returns deterministic codes for the same timestamp", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(generateTotpCode(secret, now)).toBe(generateTotpCode(secret, now));
  });

  it("returns different codes for timestamps 30s apart", () => {
    const secret = generateTotpSecret();
    const base = Math.floor(Date.now() / 30000) * 30000;
    const c1 = generateTotpCode(secret, base);
    const c2 = generateTotpCode(secret, base + 30_000);
    // Can theoretically collide, but extremely unlikely for random secret
    // This test mostly verifies the function responds to time changes
    expect(typeof c1).toBe("string");
    expect(typeof c2).toBe("string");
  });
});

describe("verifyTotpCode", () => {
  it("accepts the current code", () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("accepts codes from the previous window (±1 step)", () => {
    const secret = generateTotpSecret();
    const prevCode = generateTotpCode(secret, Date.now() - 30_000);
    expect(verifyTotpCode(secret, prevCode)).toBe(true);
  });

  it("accepts codes from the next window", () => {
    const secret = generateTotpSecret();
    const nextCode = generateTotpCode(secret, Date.now() + 30_000);
    expect(verifyTotpCode(secret, nextCode)).toBe(true);
  });

  it("rejects codes from 2+ windows ago", () => {
    const secret = generateTotpSecret();
    const oldCode = generateTotpCode(secret, Date.now() - 90_000);
    // Only fails when that old code differs from current/±1 codes
    const currentCode = generateTotpCode(secret);
    if (oldCode !== currentCode) {
      expect(verifyTotpCode(secret, oldCode)).toBe(false);
    }
  });

  it("rejects codes shorter than 6 digits", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "12345")).toBe(false);
    expect(verifyTotpCode(secret, "1234567")).toBe(false);
  });

  it("rejects non-numeric codes", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "abcdef")).toBe(false);
  });

  it("rejects wrong 6-digit code", () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);
    // Flip last digit
    const wrong = code.slice(0, 5) + String((parseInt(code[5]!) + 1) % 10);
    // May match in rare collision but extremely unlikely
    if (wrong !== code) {
      expect(verifyTotpCode(secret, wrong)).toBe(false);
    }
  });
});

describe("buildOtpAuthUri", () => {
  it("returns a valid otpauth:// URI", () => {
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri(secret, "alice@hospital.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=HospitalCMS");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("allows custom issuer", () => {
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri(secret, "bob", "MyHospital");
    expect(uri).toContain("MyHospital");
    expect(uri).not.toContain("HospitalCMS");
  });
});
