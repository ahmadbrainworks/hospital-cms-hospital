/**
 * TOTP (RFC 6238) — software implementation, no external TOTP library dependency.
 *
 * Uses HMAC-SHA1 with a 30-second step and 6-digit codes.
 * Accepts ±1 window (90 seconds) to tolerate clock skew.
 *
 * The secret is stored AES-256-GCM encrypted in the User document
 * and decrypted only at verification time.
 */
import { createHmac, randomBytes } from 'node:crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // ±1 step tolerance

// Base32 alphabet (RFC 4648)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  // 20 bytes = 160 bits, encoded as base32 = 32 characters
  const raw = randomBytes(20);
  let result = '';
  let buffer = 0;
  let bitsLeft = 0;
  for (const byte of raw) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      bitsLeft -= 5;
      result += BASE32_CHARS[(buffer >> bitsLeft) & 0x1f];
    }
  }
  if (bitsLeft > 0) {
    result += BASE32_CHARS[(buffer << (5 - bitsLeft)) & 0x1f];
  }
  return result;
}

function base32Decode(encoded: string): Buffer {
  const upper = encoded.toUpperCase().replace(/=+$/, '');
  let buffer = 0;
  let bitsLeft = 0;
  const output: number[] = [];
  for (const char of upper) {
    const val = BASE32_CHARS.indexOf(char);
    if (val < 0) throw new Error(`Invalid base32 character: ${char}`);
    buffer = (buffer << 5) | val;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      output.push((buffer >> bitsLeft) & 0xff);
    }
  }
  return Buffer.from(output);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  // Write counter as big-endian 64-bit integer
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hmac = createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    (((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff)) %
    Math.pow(10, DIGITS);
  return code.toString().padStart(DIGITS, '0');
}

/**
 * Generate the current TOTP code for a given secret.
 * Used in tests to produce a valid code without a phone app.
 */
export function generateTotpCode(secret: string, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  return hotp(secret, counter);
}

/**
 * Verify a 6-digit TOTP code against the secret.
 * Accepts ±WINDOW steps to handle clock skew.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let delta = -WINDOW; delta <= WINDOW; delta++) {
    if (hotp(secret, counter + delta) === code) return true;
  }
  return false;
}

/**
 * Build an otpauth:// URI for QR code generation.
 */
export function buildOtpAuthUri(secret: string, account: string, issuer = 'HospitalCMS'): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params}`;
}
