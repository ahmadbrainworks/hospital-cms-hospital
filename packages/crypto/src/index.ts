import {
  createHash,
  createHmac,
  randomBytes,
  createVerify,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";

// CRYPTOGRAPHIC UTILITIES — verify-only subset.
// Safe to include in the hospital client runtime.
// Signing functions live in @hospital-cms/crypto-vendor (vendor + agent only).

//  Hashing

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha512(data: string | Buffer): string {
  return createHash("sha512").update(data).digest("hex");
}

export function hmacSha256(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return timingSafeEqual(bufA, bufB);
}

//  Random

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

export function generateInstanceId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString("hex");
  return `inst_${timestamp}_${random}`;
}

//  RSA Verification (public-key operations only)

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export function verifyWithPublicKey(
  data: string | Buffer,
  signature: string,
  publicKeyPem: string,
): boolean {
  try {
    const verify = createVerify("SHA256");
    verify.update(data);
    verify.end();
    return verify.verify(publicKeyPem, signature, "base64");
  } catch {
    return false;
  }
}

//  Signed Payload (verify only)

export interface SignedPayload {
  data: string;
  signature: string;
  publicKeyId: string;
  signedAt: string;
}

export function verifyPayload(
  signed: SignedPayload,
  publicKeyPem: string,
): boolean {
  return verifyWithPublicKey(signed.data, signed.signature, publicKeyPem);
}

//  AES-256-GCM Encryption (for secrets at rest)

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptAes256Gcm(
  plaintext: string,
  keyHex: string,
): EncryptedData {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (64 hex chars)");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptAes256Gcm(
  encrypted: EncryptedData,
  keyHex: string,
): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

//  Audit Chain Hash

export function computeAuditHash(
  entryData: string,
  previousHash?: string,
): string {
  const content = previousHash ? `${previousHash}::${entryData}` : entryData;
  return sha256(content);
}

//  License Token

export interface LicensePayload {
  licenseId: string;
  instanceId: string;
  /** Subscription tier: "community" | "professional" | "enterprise" */
  tier: string;
  features: string[];
  maxUsers: number;
  maxBeds: number;
  issuedAt: string;
  expiresAt: string;
}

/**
 * Verify and decode a license token.
 * Throws an Error (never returns null) so callers get a descriptive reason.
 */
export function verifyLicenseToken(
  token: string,
  publicKeyPem: string,
): LicensePayload {
  let decoded: { payload: string; signature: string };
  try {
    decoded = JSON.parse(
      Buffer.from(token, "base64").toString("utf8"),
    ) as { payload: string; signature: string };
  } catch {
    throw new Error("License token is malformed (base64/JSON decode failed)");
  }

  const isValid = verifyWithPublicKey(
    decoded.payload,
    decoded.signature,
    publicKeyPem,
  );

  if (!isValid) {
    throw new Error("License token signature is invalid");
  }

  return JSON.parse(decoded.payload) as LicensePayload;
}
