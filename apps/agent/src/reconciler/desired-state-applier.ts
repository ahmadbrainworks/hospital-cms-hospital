/**
 * Desired-state applier.
 *
 * Reads the DesiredStateDocument fetched from the control-panel and
 * reconciles the local system (packages, config) to match.
 * Reports a ReconciliationSummary that is included in the next heartbeat.
 */
import { createLogger } from "@hospital-cms/logger";
import { verifyWithPublicKey } from "@hospital-cms/crypto";
import { sha256 } from "@hospital-cms/crypto";
import { LicenseLeaseRepository } from "@hospital-cms/database";
import type {
  DesiredStateDocument,
  DesiredPackageEntry,
  PackageManifest,
  ReconciliationSummary,
} from "@hospital-cms/contracts";
import type { Db } from "mongodb";
import type { AgentConfig } from "../config";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const logger = createLogger({ module: "DesiredStateApplier" });

export class DesiredStateApplier {
  private readonly vendorPublicKey: string;
  private readonly packagesDir: string;
  private readonly controlPanelUrl: string;

  constructor(config: AgentConfig) {
    this.vendorPublicKey = config.VENDOR_PUBLIC_KEY;
    this.packagesDir = config.PACKAGES_DIR;
    this.controlPanelUrl = config.CONTROL_PANEL_URL;
  }

  /**
   * Apply a desired state document.
   * Returns a reconciliation summary for the next heartbeat.
   */
  async apply(state: DesiredStateDocument): Promise<ReconciliationSummary> {
    const packagesInstalled: string[] = [];
    const packagesRemoved: string[] = [];
    const packagesFailed: Array<{ packageId: string; error: string }> = [];
    const configKeysApplied: string[] = [];
    const errors: string[] = [];

    // 1. Reconcile packages
    for (const entry of state.packages) {
      try {
        await this.reconcilePackage(entry);
        if (entry.action === "remove") {
          packagesRemoved.push(entry.packageId);
        } else {
          packagesInstalled.push(
            `${entry.packageId}@${entry.version ?? "latest"}`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ packageId: entry.packageId, err: msg }, "Package reconciliation failed");
        packagesFailed.push({ packageId: entry.packageId, error: msg });
        errors.push(`${entry.packageId}: ${msg}`);
      }
    }

    // 2. Config keys are written to a local override file (the API reads this)
    const configPath = join(this.packagesDir, "..", "config-overrides.json");
    try {
      const existing: Record<string, unknown> = existsSync(configPath)
        ? (JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>)
        : {};
      const merged = { ...existing, ...state.config };
      writeFileSync(configPath, JSON.stringify(merged, null, 2), {
        mode: 0o600,
      });
      configKeysApplied.push(...Object.keys(state.config));
      logger.info({ keys: configKeysApplied.length }, "Config overrides written");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`config: ${msg}`);
    }

    const summary: ReconciliationSummary = {
      appliedStateVersion: state.version,
      completedAt: new Date().toISOString(),
      packagesInstalled,
      packagesRemoved,
      packagesFailed,
      configKeysApplied,
      errors,
    };

    logger.info(
      {
        version: state.version,
        installed: packagesInstalled.length,
        removed: packagesRemoved.length,
        failed: packagesFailed.length,
      },
      "Desired state applied",
    );
    return summary;
  }

  private async reconcilePackage(entry: DesiredPackageEntry): Promise<void> {
    if (entry.action === "remove") {
      await this.removePackage(entry.packageId);
      return;
    }

    if (!entry.version) {
      throw new Error(`version required for action ${entry.action}`);
    }

    // Fetch signed manifest from control panel
    const manifest = await this.fetchManifest(entry.packageId, entry.version);

    // Verify the manifest signature
    this.verifyManifestSignature(manifest);

    // Download and verify the archive
    await this.downloadAndVerifyArchive(manifest);
  }

  private async fetchManifest(
    packageId: string,
    version: string,
  ): Promise<PackageManifest> {
    const url = `${this.controlPanelUrl.replace(/\/$/, "")}/api/vendor/packages/${packageId}/${version}/manifest`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      throw new Error(
        `Failed to fetch manifest for ${packageId}@${version}: HTTP ${res.status}`,
      );
    }
    const json = (await res.json()) as { success: boolean; data: PackageManifest };
    if (!json.success || !json.data) {
      throw new Error(`Invalid manifest response for ${packageId}@${version}`);
    }
    return json.data;
  }

  private verifyManifestSignature(manifest: PackageManifest): void {
    if (!manifest.vendorSigned) {
      throw new Error(
        `Package ${manifest.packageId}@${manifest.version} is not vendor-signed`,
      );
    }

    const { signature, ...rest } = manifest;
    const canonical = JSON.stringify(
      { ...rest, signature: "" },
      Object.keys({ ...rest, signature: "" }).sort(),
    );
    const valid = verifyWithPublicKey(
      canonical,
      signature,
      this.vendorPublicKey,
    );
    if (!valid) {
      throw new Error(
        `Manifest signature verification FAILED for ${manifest.packageId}@${manifest.version}`,
      );
    }
    logger.debug(
      { packageId: manifest.packageId, version: manifest.version },
      "Manifest signature verified",
    );
  }

  private async downloadAndVerifyArchive(
    manifest: PackageManifest,
  ): Promise<string> {
    const destDir = join(
      this.packagesDir,
      manifest.type,
      manifest.packageId,
      manifest.version,
    );
    const archivePath = join(destDir, "package.tar.gz");

    if (existsSync(archivePath)) {
      // Verify checksum even if already downloaded
      await this.verifyChecksum(archivePath, manifest.checksum, manifest.packageId);
      return archivePath;
    }

    // Validate download URL against control panel origin (SSRF guard)
    this.assertDownloadUrlAllowed(manifest.downloadUrl);

    mkdirSync(destDir, { recursive: true });
    await this.download(manifest.downloadUrl, archivePath);
    await this.verifyChecksum(archivePath, manifest.checksum, manifest.packageId);

    logger.info(
      { packageId: manifest.packageId, version: manifest.version, type: manifest.type },
      "Package archive downloaded and verified",
    );
    return archivePath;
  }

  private assertDownloadUrlAllowed(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid download URL: ${url}`);
    }

    // Allow HTTPS from the control panel host or configured CDN hosts
    if (parsed.protocol !== "https:") {
      // Allow http in development
      if (process.env["NODE_ENV"] !== "development") {
        throw new Error(`Package download URL must use HTTPS: ${url}`);
      }
    }

    const allowedHosts = [
      new URL(this.controlPanelUrl).hostname,
      ...(process.env["VENDOR_CDN_HOSTS"] ?? "").split(",").map((h) => h.trim()),
    ].filter(Boolean);

    const host = parsed.hostname.toLowerCase();
    if (!allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      throw new Error(
        `Package download host '${host}' is not in the allowed list`,
      );
    }
  }

  private async download(url: string, destPath: string): Promise<void> {
    logger.info({ url }, "Downloading package archive");
    const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status} ${url}`);
    }
    const fileStream = createWriteStream(destPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await pipeline(response.body as any, fileStream);
  }

  private async verifyChecksum(
    filePath: string,
    expected: string,
    label: string,
  ): Promise<void> {
    const content = readFileSync(filePath);
    const actual = sha256(content);
    if (actual !== expected) {
      throw new Error(
        `Checksum mismatch for ${label}: expected ${expected}, got ${actual}`,
      );
    }
  }

  private async removePackage(packageId: string): Promise<void> {
    const { rm } = await import("node:fs/promises");
    // Find all versions of this package across all types
    for (const type of ["theme", "plugin", "widget"]) {
      const pkgDir = join(this.packagesDir, type, packageId);
      if (existsSync(pkgDir)) {
        await rm(pkgDir, { recursive: true, force: true });
        logger.info({ packageId, type }, "Package removed");
        return;
      }
    }
    logger.warn({ packageId }, "Package not found for removal — already gone");
  }
}
