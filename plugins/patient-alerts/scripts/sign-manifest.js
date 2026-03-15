#!/usr/bin/env node
/**
 * Vendor signing script — run this from the vendor's secure signing environment.
 *
 * Usage:
 *   VENDOR_PRIVATE_KEY_PATH=/path/to/vendor.key node scripts/sign-manifest.js
 *
 * Produces:
 *   manifest.signed.json  — manifest with real vendor signature
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const keyPath = process.env.VENDOR_PRIVATE_KEY_PATH;
if (!keyPath) {
  console.error('Error: VENDOR_PRIVATE_KEY_PATH env var is required');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf-8'));
const privateKeyPem = readFileSync(keyPath, 'utf-8');

// Remove existing placeholder signature before signing
const { signature: _ignored, ...manifestToSign } = manifest;
const signingPayload = JSON.stringify(manifestToSign, Object.keys(manifestToSign).sort());

const signer = createSign('SHA256');
signer.update(signingPayload);
const signature = signer.sign(privateKeyPem, 'base64');

const signed = { ...manifestToSign, signature };
const outPath = join(root, 'manifest.signed.json');
writeFileSync(outPath, JSON.stringify(signed, null, 2), 'utf-8');

console.log('✓ Manifest signed successfully');
console.log(`  Output: ${outPath}`);
console.log(`  Signature (first 32 chars): ${signature.slice(0, 32)}...`);
