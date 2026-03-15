"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRsaKeyPair = generateRsaKeyPair;
exports.saveKeyPair = saveKeyPair;
exports.loadPrivateKey = loadPrivateKey;
exports.loadPublicKey = loadPublicKey;
exports.signWithPrivateKey = signWithPrivateKey;
exports.signPayload = signPayload;
exports.signLicenseToken = signLicenseToken;
// Re-export everything from the verify-only crypto package
__exportStar(require("@hospital-cms/crypto"), exports);
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
// ── RSA Key Generation ────────────────────────────────────────────────────────
function generateRsaKeyPair() {
    const { publicKey, privateKey } = (0, node_crypto_1.generateKeyPairSync)("rsa", {
        modulusLength: 4096,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    return { publicKey, privateKey };
}
function saveKeyPair(privatePath, publicPath, pair) {
    (0, node_fs_1.writeFileSync)(privatePath, pair.privateKey, { mode: 0o600 });
    (0, node_fs_1.writeFileSync)(publicPath, pair.publicKey, { mode: 0o644 });
}
function loadPrivateKey(path) {
    return (0, node_fs_1.readFileSync)(path, "utf8");
}
function loadPublicKey(path) {
    return (0, node_fs_1.readFileSync)(path, "utf8");
}
// ── RSA Signing ───────────────────────────────────────────────────────────────
function signWithPrivateKey(data, privateKeyPem) {
    const sign = (0, node_crypto_1.createSign)("SHA256");
    sign.update(data);
    sign.end();
    return sign.sign(privateKeyPem, "base64");
}
// ── Signed Payload ────────────────────────────────────────────────────────────
function signPayload(data, privateKeyPem, publicKeyId) {
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
function signLicenseToken(payload, privateKeyPem) {
    const data = JSON.stringify(payload);
    const signature = signWithPrivateKey(data, privateKeyPem);
    return Buffer.from(JSON.stringify({ payload: data, signature })).toString("base64");
}
//# sourceMappingURL=index.js.map