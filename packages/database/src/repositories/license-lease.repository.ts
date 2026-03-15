import { Db } from "mongodb";
import type { LicenseLeaseDocument } from "@hospital-cms/contracts";
import { BaseRepository } from "../base-repository";
import { COLLECTIONS } from "../collections";

/**
 * Stores the short-lived license lease documents written by the agent
 * after each heartbeat.  The license-guard reads the active lease instead
 * of the long-lived license record so enforcement is tied to the agent's
 * heartbeat cadence.
 */
export class LicenseLeaseRepository extends BaseRepository<LicenseLeaseDocument> {
  constructor(db: Db) {
    super(db, COLLECTIONS.LICENSE_LEASES, "LicenseLease");
  }

  /** Find the active (not expired) lease for an instance. */
  async findActiveLease(
    instanceId: string,
  ): Promise<LicenseLeaseDocument | null> {
    return this.collection.findOne({
      instanceId,
      status: "active",
      expiresAt: { $gt: new Date().toISOString() },
    }) as Promise<LicenseLeaseDocument | null>;
  }

  /**
   * Upsert the lease for an instance.
   * Called by the agent after a successful heartbeat response that includes
   * a new license token.
   */
  async upsertLease(lease: LicenseLeaseDocument): Promise<void> {
    await this.collection.updateOne(
      { instanceId: lease.instanceId },
      { $set: { ...lease } },
      { upsert: true },
    );
  }

  /** Mark a lease as revoked (e.g. on license:null heartbeat response). */
  async revokeLease(instanceId: string): Promise<void> {
    await this.collection.updateOne(
      { instanceId },
      { $set: { status: "revoked" as const } },
    );
  }
}
