#!/usr/bin/env node
/**
 * Sign the plugin manifest with the vendor private key.
 *
 * Usage:
 *   VENDOR_PRIVATE_KEY_PATH=./vendor.key node scripts/sign-manifest.js
 *
 * This creates a detached RSA-SHA256 signature over the manifest JSON
 * (excluding the "signature" field) and writes it back into manifest.json.
 */
const { readFileSync, writeFileSync } = require("node:fs");
const { createSign } = require("node:crypto");
const { resolve } = require("node:path");

const manifestPath = resolve(__dirname, "../manifest.json");
const keyPath = process.env.VENDOR_PRIVATE_KEY_PATH;

if (!keyPath) {
  console.error("Set VENDOR_PRIVATE_KEY_PATH to the vendor RSA private key.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const privateKey = readFileSync(keyPath, "utf8");

// Remove signature field before signing
const { signature: _, ...manifestWithoutSig } = manifest;
const payload = JSON.stringify(manifestWithoutSig, null, 2);

const signer = createSign("RSA-SHA256");
signer.update(payload);
const sig = signer.sign(privateKey, "base64");

manifest.signature = sig;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log("Manifest signed successfully.");
console.log(`  Plugin: ${manifest.pluginId} v${manifest.version}`);
console.log(`  Signature: ${sig.substring(0, 40)}...`);
