import { Db } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "@hospital-cms/logger";
import { NotFoundError, ConflictError } from "@hospital-cms/errors";
import { signLicenseToken } from "@hospital-cms/crypto-vendor";
import { verifyLicenseToken } from "@hospital-cms/crypto";
import { CP_COLLECTIONS } from "../db";
import type { LicenseRecord } from "../types";
import { VendorAuditService } from "./vendor-audit.service";

const logger = createLogger({ module: "LicenseService" });

const TIER_FEATURES: Record<LicenseRecord["tier"], string[]> = {
  community: ["patients", "encounters", "billing_basic", "lab_basic"],
  professional: [
    "patients",
    "encounters",
    "billing_basic",
    "billing_advanced",
    "lab_basic",
    "lab_advanced",
    "pharmacy",
    "workflow_engine",
    "plugin_runtime",
    "theme_engine",
    "audit_export",
  ],
  enterprise: [
    "patients",
    "encounters",
    "billing_basic",
    "billing_advanced",
    "lab_basic",
    "lab_advanced",
    "pharmacy",
    "workflow_engine",
    "plugin_runtime",
    "theme_engine",
    "audit_export",
    "multi_location",
    "api_access",
    "custom_reports",
    "sso",
  ],
};

const TIER_MAX_BEDS: Record<LicenseRecord["tier"], number> = {
  community: 50,
  professional: 500,
  enterprise: 99999,
};

const TIER_MAX_USERS: Record<LicenseRecord["tier"], number> = {
  community: 20,
  professional: 200,
  enterprise: 99999,
};

export class LicenseService {
  private readonly audit: VendorAuditService;

  constructor(
    private readonly db: Db,
    private readonly vendorPrivateKey: string,
  ) {
    this.audit = new VendorAuditService(db);
  }

  private col() {
    return this.db.collection<LicenseRecord>(CP_COLLECTIONS.LICENSES);
  }

  async issue(
    instanceId: string,
    tier: LicenseRecord["tier"],
    validDays: number,
  ): Promise<LicenseRecord> {
    // Revoke any existing active license for this instance
    const existing = await this.col().findOne({ instanceId, revokedAt: null });
    if (existing) {
      await this.col().updateOne(
        { licenseId: existing.licenseId },
        {
          $set: {
            revokedAt: new Date(),
            revokeReason: "Superseded by new license",
          },
        },
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);
    const licenseId = uuidv4();

    const licensePayload = {
      licenseId,
      instanceId,
      tier,
      features: TIER_FEATURES[tier],
      maxBeds: TIER_MAX_BEDS[tier],
      maxUsers: TIER_MAX_USERS[tier],
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const signature = signLicenseToken(licensePayload, this.vendorPrivateKey);

    const record: LicenseRecord = {
      ...licensePayload,
      issuedAt: now,
      expiresAt,
      signature,
      revokedAt: null,
      revokeReason: null,
    };

    await this.col().insertOne(record as any);
    logger.info({ licenseId, instanceId, tier, expiresAt }, "License issued");
    this.audit.log("license.issued", { licenseId, tier, validDays, expiresAt }, instanceId);
    return record;
  }

  async getActiveForInstance(
    instanceId: string,
  ): Promise<LicenseRecord | null> {
    return this.col().findOne({
      instanceId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
  }

  async revoke(licenseId: string, reason: string): Promise<void> {
    const license = await this.col().findOne({ licenseId });
    if (!license) throw new NotFoundError("License not found");
    if (license.revokedAt) throw new ConflictError("License already revoked");

    await this.col().updateOne(
      { licenseId },
      { $set: { revokedAt: new Date(), revokeReason: reason } },
    );
    logger.info({ licenseId, reason }, "License revoked");
    this.audit.log("license.revoked", { licenseId, reason }, license.instanceId);
  }

  async verify(licenseToken: string): Promise<{
    valid: boolean;
    payload?: Record<string, unknown>;
    error?: string;
  }> {
    try {
      const payload = verifyLicenseToken(licenseToken, this.vendorPrivateKey);
      return { valid: true, payload: payload as unknown as Record<string, unknown> };
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  }

  async listForInstance(instanceId: string): Promise<LicenseRecord[]> {
    return this.col().find({ instanceId }).sort({ issuedAt: -1 }).toArray();
  }

  async listAll(limit = 100): Promise<LicenseRecord[]> {
    return this.col().find({}).sort({ issuedAt: -1 }).limit(limit).toArray();
  }
}
