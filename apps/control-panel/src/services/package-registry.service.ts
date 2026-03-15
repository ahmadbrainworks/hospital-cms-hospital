/**
 * Package registry service.
 *
 * The vendor uploads packages (themes, plugins, widgets) via the control
 * panel.  The control-panel signs each manifest with the vendor RSA private
 * key before storing it.  Instances fetch packages from signed download URLs.
 */
import { Db } from "mongodb";
import { randomUUID } from "crypto";
import { createLogger } from "@hospital-cms/logger";
import { NotFoundError, ConflictError } from "@hospital-cms/errors";
import { signWithPrivateKey } from "@hospital-cms/crypto-vendor";
import type { PackageManifest, BasePackageManifest } from "@hospital-cms/contracts";
import { CP_COLLECTIONS } from "../db";

const logger = createLogger({ module: "PackageRegistryService" });

export interface StoredPackage {
  _id?: unknown;
  packageId: string;
  version: string;
  type: string;
  name: string;
  description: string;
  author: string;
  checksum: string;
  size: number;
  publishedAt: string;
  /** Relative archive path within the package storage root */
  archivePath: string;
  /** Full signed manifest */
  manifest: PackageManifest;
  /** Whether this version is yanked (hidden from new installs) */
  yanked: boolean;
}

export class PackageRegistryService {
  constructor(
    private readonly db: Db,
    private readonly vendorPrivateKey: string,
  ) {}

  private col() {
    return this.db.collection<StoredPackage>(CP_COLLECTIONS.PACKAGES);
  }

  /**
   * Publish a new package version.
   * Signs the manifest with the vendor private key before storing.
   */
  async publish(
    unsignedManifest: Omit<PackageManifest, "vendorSigned" | "signature" | "publicKeyId">,
    archivePath: string,
  ): Promise<StoredPackage> {
    // Check for duplicate packageId@version
    const existing = await this.col().findOne({
      packageId: unsignedManifest.packageId,
      version: unsignedManifest.version,
    });
    if (existing) {
      throw new ConflictError(`Package ${unsignedManifest.packageId}@${unsignedManifest.version} already exists`);
    }

    // Sign the manifest
    const manifestToSign = {
      ...unsignedManifest,
      vendorSigned: true as const,
      signature: "",
      publicKeyId: "vendor-key-v1",
    } as PackageManifest;

    const canonical = JSON.stringify(
      manifestToSign,
      Object.keys(manifestToSign as object).sort(),
    );
    const signature = signWithPrivateKey(canonical, this.vendorPrivateKey);

    const signedManifest: PackageManifest = {
      ...(manifestToSign as unknown as BasePackageManifest),
      signature,
    } as unknown as PackageManifest;

    const stored: StoredPackage = {
      packageId: unsignedManifest.packageId,
      version: unsignedManifest.version,
      type: unsignedManifest.type,
      name: unsignedManifest.name,
      description: unsignedManifest.description,
      author: unsignedManifest.author,
      checksum: unsignedManifest.checksum,
      size: unsignedManifest.size,
      publishedAt: new Date().toISOString(),
      archivePath,
      manifest: signedManifest,
      yanked: false,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.col().insertOne(stored as any);
    logger.info(
      { packageId: stored.packageId, version: stored.version, type: stored.type },
      "Package published",
    );
    return stored;
  }

  /** List all (non-yanked) packages, optionally filtered by type. */
  async list(type?: string): Promise<StoredPackage[]> {
    const filter: Record<string, unknown> = { yanked: false };
    if (type) filter["type"] = type;
    return this.col()
      .find(filter, { projection: { "manifest": 0 } })
      .sort({ publishedAt: -1 })
      .toArray();
  }

  /** Get a specific package version's full manifest. */
  async getManifest(
    packageId: string,
    version: string,
  ): Promise<PackageManifest> {
    const pkg = await this.col().findOne({ packageId, version, yanked: false });
    if (!pkg) {
      throw new NotFoundError(`Package ${packageId}@${version} not found`);
    }
    return pkg.manifest;
  }

  /** Get the latest non-yanked version of a package. */
  async getLatest(packageId: string): Promise<StoredPackage | null> {
    return this.col().findOne(
      { packageId, yanked: false },
      { sort: { publishedAt: -1 } },
    );
  }

  /** Yank a package version (hides it from new installs, doesn't delete). */
  async yank(packageId: string, version: string): Promise<void> {
    const result = await this.col().updateOne(
      { packageId, version },
      { $set: { yanked: true } },
    );
    if (result.matchedCount === 0) {
      throw new NotFoundError(`Package ${packageId}@${version} not found`);
    }
    logger.warn({ packageId, version }, "Package version yanked");
  }

  /** List all versions of a package (including yanked, for vendor view). */
  async listVersions(packageId: string): Promise<StoredPackage[]> {
    return this.col()
      .find({ packageId }, { projection: { "manifest": 0 } })
      .sort({ publishedAt: -1 })
      .toArray();
  }

  /** Get a single package by packageId (latest non-yanked version). */
  async getByPackageId(packageId: string): Promise<StoredPackage | null> {
    return this.getLatest(packageId);
  }

  /** Get all published (non-yanked) versions of a package. */
  async getPublishedVersions(packageId: string): Promise<StoredPackage[]> {
    return this.col()
      .find({ packageId, yanked: false }, { projection: { "manifest": 0 } })
      .sort({ publishedAt: -1 })
      .toArray();
  }
}
