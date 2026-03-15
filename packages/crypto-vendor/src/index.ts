/**
 * @hospital-cms/crypto-vendor
 *
 * Signing-only cryptographic utilities for vendor-side and agent-side code.
 * MUST NOT be installed on the hospital API runtime (hospital client).
 *
 * Re-exports everything from @hospital-cms/crypto (verify + hash + AES)
 * and adds signing functions:
 *   - generateRsaKeyPair / saveKeyPair / loadPrivateKey / loadPublicKey
 *   - signWithPrivateKey
 *   - signPayload
 *   - signLicenseToken
 *
 * Consumers:
 *   - apps/control-panel (sign license tokens, commands)
 *   - apps/agent          (sign heartbeats with instance private key)
 */

// Re-export everything from the verify-only crypto package
export * from "@hospital-cms/crypto";

import {
  generateKeyPairSync,
  createSign,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { KeyPair, LicensePayload, SignedPayload } from "@hospital-cms/crypto";
import { verifyWithPublicKey } from "@hospital-cms/crypto";

// ── RSA Key Generation ────────────────────────────────────────────────────────

export function generateRsaKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function saveKeyPair(
  privatePath: string,
  publicPath: string,
  pair: KeyPair,
): void {
  writeFileSync(privatePath, pair.privateKey, { mode: 0o600 });
  writeFileSync(publicPath, pair.publicKey, { mode: 0o644 });
}

export function loadPrivateKey(path: string): string {
  return readFileSync(path, "utf8");
}

export function loadPublicKey(path: string): string {
  return readFileSync(path, "utf8");
}

// ── RSA Signing ───────────────────────────────────────────────────────────────

export function signWithPrivateKey(
  data: string | Buffer,
  privateKeyPem: string,
): string {
  const sign = createSign("SHA256");
  sign.update(data);
  sign.end();
  return sign.sign(privateKeyPem, "base64");
}

// ── Signed Payload ────────────────────────────────────────────────────────────

export function signPayload(
  data: unknown,
  privateKeyPem: string,
  publicKeyId: string,
): SignedPayload {
  const serialized = JSON.stringify(data);
  const signature = signWithPrivateKey(serialized, privateKeyPem);
  return {
    data: serialized,
    signature,
    publicKeyId,
    signedAt: new Date().toISOString(),
  };
}

// ── License Token Signing ─────────────────────────────────────────────────────

export function signLicenseToken(
  payload: LicensePayload,
  privateKeyPem: string,
): string {
  const data = JSON.stringify(payload);
  const signature = signWithPrivateKey(data, privateKeyPem);
  return Buffer.from(JSON.stringify({ payload: data, signature })).toString(
    "base64",
  );
}
