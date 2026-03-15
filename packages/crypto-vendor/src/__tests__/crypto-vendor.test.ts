import { describe, it, expect } from "vitest";
import {
  generateRsaKeyPair,
  signWithPrivateKey,
  verifyWithPublicKey,
  signPayload,
  verifyPayload,
  signLicenseToken,
  verifyLicenseToken,
} from "../index";

describe("RSA key pair", () => {
  it("generates key pair", () => {
    const pair = generateRsaKeyPair();
    expect(pair.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(pair.privateKey).toContain("BEGIN PRIVATE KEY");
  });

  it("signs and verifies data", () => {
    const pair = generateRsaKeyPair();
    const data = "hospital-cms-test-payload";
    const sig = signWithPrivateKey(data, pair.privateKey);
    expect(verifyWithPublicKey(data, sig, pair.publicKey)).toBe(true);
  });

  it("rejects tampered data", () => {
    const pair = generateRsaKeyPair();
    const sig = signWithPrivateKey("original", pair.privateKey);
    expect(verifyWithPublicKey("tampered", sig, pair.publicKey)).toBe(false);
  });

  it("rejects wrong public key", () => {
    const pair1 = generateRsaKeyPair();
    const pair2 = generateRsaKeyPair();
    const sig = signWithPrivateKey("data", pair1.privateKey);
    expect(verifyWithPublicKey("data", sig, pair2.publicKey)).toBe(false);
  });
});

describe("signPayload / verifyPayload", () => {
  it("signs and verifies JSON payload", () => {
    const pair = generateRsaKeyPair();
    const data = { pluginId: "radiology", version: "1.0.0" };
    const signed = signPayload(data, pair.privateKey, "key-001");
    expect(verifyPayload(signed, pair.publicKey)).toBe(true);
  });

  it("rejects tampered payload", () => {
    const pair = generateRsaKeyPair();
    const signed = signPayload({ x: 1 }, pair.privateKey, "key-001");
    const tampered = { ...signed, data: JSON.stringify({ x: 999 }) };
    expect(verifyPayload(tampered, pair.publicKey)).toBe(false);
  });
});

describe("signLicenseToken / verifyLicenseToken", () => {
  it("signs and verifies license token", () => {
    const pair = generateRsaKeyPair();
    const payload = {
      licenseId: "lic-001",
      instanceId: "inst-001",
      tier: "enterprise",
      features: ["patients", "billing"],
      maxUsers: 100,
      maxBeds: 500,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    };

    const token = signLicenseToken(payload, pair.privateKey);
    const verified = verifyLicenseToken(token, pair.publicKey);

    expect(verified.licenseId).toBe("lic-001");
    expect(verified.tier).toBe("enterprise");
  });

  it("throws for invalid token", () => {
    const pair = generateRsaKeyPair();
    expect(() => verifyLicenseToken("invalid-base64!!", pair.publicKey)).toThrow();
  });
});
