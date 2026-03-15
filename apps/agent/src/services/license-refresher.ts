/**
 * License refresher — processes the license payload from each heartbeat
 * response and writes/updates the LicenseLease document in the local
 * hospital MongoDB so the license-guard can enforce it without contacting
 * the control panel on every request.
 */
import { createLogger } from "@hospital-cms/logger";
import { verifyWithPublicKey } from "@hospital-cms/crypto";
import { LicenseLeaseRepository } from "@hospital-cms/database";
import type { LicenseLeaseDocument } from "@hospital-cms/contracts";
import type { Db } from "mongodb";
import type { AgentConfig } from "../config";

const logger = createLogger({ module: "LicenseRefresher" });

interface HeartbeatLicensePayload {
  tier: string;
  features: string[];
  maxBeds: number;
  expiresAt: string;   // ISO-8601
  issuedAt: string;    // ISO-8601
  signature: string;   // Base64 RSA signature over canonical JSON
}

export class LicenseRefresher {
  private readonly repo: LicenseLeaseRepository;
  private readonly instanceId: string;
  private readonly vendorPublicKey: string;

  constructor(db: Db, config: AgentConfig) {
    this.repo = new LicenseLeaseRepository(db);
    this.instanceId = config.INSTANCE_ID;
    this.vendorPublicKey = config.VENDOR_PUBLIC_KEY;
  }

  /**
   * Process a license payload from a heartbeat response.
   *
   * If `payload` is null the lease is revoked (license:null signal
   * from the control panel means the instance's license has been removed).
   */
  async processHeartbeatLicense(
    payload: HeartbeatLicensePayload | null,
  ): Promise<void> {
    if (payload === null) {
      logger.warn({ instanceId: this.instanceId }, "license:null received — revoking lease");
      await this.repo.revokeLease(this.instanceId);
      return;
    }

    // Verify the vendor's RSA signature before trusting the payload.
    const { signature, ...rest } = payload;
    const canonical = JSON.stringify(rest, Object.keys(rest).sort());
    const valid = verifyWithPublicKey(
      canonical,
      signature,
      this.vendorPublicKey,
    );

    if (!valid) {
      logger.error(
        { instanceId: this.instanceId },
        "License signature verification FAILED — skipping lease update",
      );
      return;
    }

    const expiresAt = new Date(payload.expiresAt);
    if (isNaN(expiresAt.getTime())) {
      logger.error({ expiresAt: payload.expiresAt }, "Invalid expiresAt in license payload");
      return;
    }

    const lease: LicenseLeaseDocument = {
      instanceId: this.instanceId,
      tier: payload.tier,
      features: payload.features,
      maxBeds: payload.maxBeds,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      vendorSignature: signature,
      status: "active",
      refreshedAt: new Date().toISOString(),
    };

    await this.repo.upsertLease(lease);
    logger.info(
      {
        instanceId: this.instanceId,
        tier: lease.tier,
        expiresAt: lease.expiresAt,
        features: lease.features.length,
      },
      "License lease refreshed",
    );
  }
}
