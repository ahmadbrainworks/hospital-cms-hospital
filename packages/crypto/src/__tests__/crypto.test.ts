import { describe, it, expect } from "vitest";
import {
  sha256,
  sha512,
  hmacSha256,
  secureCompare,
  generateSecureToken,
  generateNonce,
  verifyWithPublicKey,
  verifyPayload,
  encryptAes256Gcm,
  decryptAes256Gcm,
  computeAuditHash,
  verifyLicenseToken,
  type SignedPayload,
} from "../index";

describe("sha256", () => {
  it("produces consistent output", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  it("produces 64-char hex string", () => {
    expect(sha256("test")).toHaveLength(64);
  });
});

describe("sha512", () => {
  it("produces 128-char hex string", () => {
    expect(sha512("test")).toHaveLength(128);
  });
});

describe("hmacSha256", () => {
  it("produces different output for different secrets", () => {
    expect(hmacSha256("data", "secret1")).not.toBe(
      hmacSha256("data", "secret2"),
    );
  });
});

describe("secureCompare", () => {
  it("returns true for equal strings", () => {
    expect(secureCompare("abc", "abc")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(secureCompare("abc", "xyz")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(secureCompare("abc", "abcd")).toBe(false);
  });
});

describe("generateSecureToken", () => {
  it("produces unique tokens", () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).not.toBe(b);
  });

  it("produces 64-char hex by default (32 bytes)", () => {
    expect(generateSecureToken(32)).toHaveLength(64);
  });
});

describe("AES-256-GCM encryption", () => {
  const key = "0".repeat(64); // 32 zero bytes

  it("encrypts and decrypts successfully", () => {
    const plaintext = "sensitive patient data";
    const enc = encryptAes256Gcm(plaintext, key);
    expect(decryptAes256Gcm(enc, key)).toBe(plaintext);
  });

  it("produces different ciphertext each time", () => {
    const enc1 = encryptAes256Gcm("same", key);
    const enc2 = encryptAes256Gcm("same", key);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it("throws on incorrect key length", () => {
    expect(() => encryptAes256Gcm("data", "tooshort")).toThrow();
  });
});

describe("computeAuditHash", () => {
  it("includes previous hash in computation", () => {
    const h1 = computeAuditHash("entry1");
    const h2 = computeAuditHash("entry2", h1);
    const h2NoPrev = computeAuditHash("entry2");
    expect(h2).not.toBe(h2NoPrev);
  });

  it("produces deterministic output", () => {
    expect(computeAuditHash("x", "prev")).toBe(computeAuditHash("x", "prev"));
  });
});

describe("verifyWithPublicKey", () => {
  it("returns false for garbage signature", () => {
    expect(verifyWithPublicKey("data", "badsig", "badkey")).toBe(false);
  });
});

describe("verifyPayload", () => {
  it("returns false for tampered data", () => {
    const fake: SignedPayload = {
      data: '{"x":1}',
      signature: "invalidsig",
      publicKeyId: "k1",
      signedAt: new Date().toISOString(),
    };
    expect(verifyPayload(fake, "notakey")).toBe(false);
  });
});

describe("verifyLicenseToken", () => {
  it("throws for invalid token", () => {
    expect(() => verifyLicenseToken("invalid-base64!!", "notakey")).toThrow();
  });
});
