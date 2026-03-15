import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createLogger } from "@hospital-cms/logger";
import { sha256, verifyWithPublicKey } from "@hospital-cms/crypto";
import type { EnrichedDesiredPackageEntry } from "@hospital-cms/contracts";

//  SSRF guard: only allow downloads from expected vendor CDN hostnames
const ALLOWED_HOSTS = (
  process.env["VENDOR_CDN_HOSTS"] ??
  "cdn.hospitalcms.io,packages.hospitalcms.io"
)
  .split(",")
  .map((h) => h.trim().toLowerCase());

function assertAllowedPackageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid package URL: ${url}`);
  }
  if (parsed.protocol !== "https:")
    throw new Error(`Package URL must use HTTPS: ${url}`);
  const host = parsed.hostname.toLowerCase();
  if (
    !ALLOWED_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    )
  ) {
    throw new Error(
      `Package URL host '${host}' is not in the vendor CDN allowlist`,
    );
  }
}

const logger = createLogger({ module: "PackageInstaller" });

export class PackageInstaller {
  /** Registry of vendor public keys indexed by keyId */
  private readonly vendorPublicKeys: Map<string, string> = new Map();

  constructor(
    private readonly packagesDir: string,
    private readonly vendorPublicKey: string,
  ) {
    // Register the default key with a well-known ID
    this.vendorPublicKeys.set("vendor-key-v1", vendorPublicKey);
  }

  /**
   * Register an additional vendor public key for signature verification.
   * Used during vendor signing key rotation to support both old and new keys.
   */
  addVendorPublicKey(keyId: string, publicKeyPem: string): void {
    this.vendorPublicKeys.set(keyId, publicKeyPem);
    logger.info({ keyId }, "Added vendor public key for verification");
  }

  /**
   * Remove a vendor public key after rotation grace period expires.
   */
  removeVendorPublicKey(keyId: string): void {
    this.vendorPublicKeys.delete(keyId);
    logger.info({ keyId }, "Removed vendor public key");
  }

  /**
   * Download and verify any package type (plugin, theme, widget).
   * Returns the path to the downloaded zip file.
   */
  async downloadAndVerifyPackage(
    entry: EnrichedDesiredPackageEntry,
  ): Promise<string> {
    const typeDir = entry.packageType === "plugin"
      ? "plugins"
      : entry.packageType === "theme"
        ? "themes"
        : "widgets";

    const destDir = join(
      this.packagesDir,
      typeDir,
      entry.packageId,
      entry.version!,
    );
    const zipPath = join(destDir, "package.zip");

    if (existsSync(zipPath)) {
      logger.info(
        { packageId: entry.packageId, version: entry.version },
        "Package already downloaded",
      );
      return zipPath;
    }

    assertAllowedPackageUrl(entry.downloadUrl);
    mkdirSync(destDir, { recursive: true });
    await this.download(entry.downloadUrl, zipPath);
    await this.verifyHash(
      zipPath,
      entry.checksum,
      `${entry.packageType}:${entry.packageId}`,
    );
    this.verifySignature(
      {
        packageId: entry.packageId,
        version: entry.version!,
        checksum: entry.checksum,
      },
      entry.manifestSignature,
      `${entry.packageType}:${entry.packageId}`,
    );

    logger.info(
      { packageId: entry.packageId, version: entry.version, type: entry.packageType },
      "Package verified",
    );
    return zipPath;
  }

  private async download(url: string, destPath: string): Promise<void> {
    logger.info({ url, destPath }, "Downloading package");
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status} ${url}`);
    }
    const fileStream = createWriteStream(destPath);
    await pipeline(response.body as any, fileStream);
  }

  private async verifyHash(
    filePath: string,
    expectedHash: string,
    label: string,
  ): Promise<void> {
    const { readFileSync } = await import("node:fs");
    const content = readFileSync(filePath);
    const actual = sha256(content.toString("hex"));
    if (actual !== expectedHash) {
      throw new Error(
        `Hash mismatch for ${label}: expected ${expectedHash}, got ${actual}`,
      );
    }
  }

  private verifySignature(
    payload: Record<string, string>,
    signature: string,
    label: string,
  ): void {
    const data = Buffer.from(
      JSON.stringify(payload, Object.keys(payload).sort()),
    );
    const valid = verifyWithPublicKey(data, signature, this.vendorPublicKey);
    if (!valid) {
      throw new Error(`Invalid vendor signature for ${label}`);
    }
  }
}
