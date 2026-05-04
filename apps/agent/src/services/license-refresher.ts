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
import { Buffer } from "node:buffer";

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

    // The signature field contains a base64-encoded license token: { payload, signature }
    // Decode it first, then verify the RSA signature
    let decodedToken: { payload: string; signature: string };
    try {
      const tokenJson = Buffer.from(payload.signature, "base64").toString("utf8");
      decodedToken = JSON.parse(tokenJson) as { payload: string; signature: string };
    } catch (err) {
      logger.error(
        { instanceId: this.instanceId, error: String(err) },
        "Failed to decode license token",
      );
      return;
    }

    // Verify the vendor's RSA signature over the payload
    const valid = verifyWithPublicKey(
      decodedToken.payload,
      decodedToken.signature,
      this.vendorPublicKey,
    );

    if (!valid) {
      logger.error(
        {
          instanceId: this.instanceId,
          tier: payload.tier,
          expiresAt: payload.expiresAt,
        },
        "License signature verification FAILED",
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
      vendorSignature: decodedToken.signature,
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
