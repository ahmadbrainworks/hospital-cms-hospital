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
export * from "@hospital-cms/crypto";
import type { KeyPair, LicensePayload, SignedPayload } from "@hospital-cms/crypto";
export declare function generateRsaKeyPair(): KeyPair;
export declare function saveKeyPair(privatePath: string, publicPath: string, pair: KeyPair): void;
export declare function loadPrivateKey(path: string): string;
export declare function loadPublicKey(path: string): string;
export declare function signWithPrivateKey(data: string | Buffer, privateKeyPem: string): string;
export declare function signPayload(data: unknown, privateKeyPem: string, publicKeyId: string): SignedPayload;
export declare function signLicenseToken(payload: LicensePayload, privateKeyPem: string): string;
//# sourceMappingURL=index.d.ts.map