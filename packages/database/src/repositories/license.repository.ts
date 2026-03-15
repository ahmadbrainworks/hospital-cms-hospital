import { Db } from "mongodb";
import type { License } from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

export class LicenseRepository extends BaseRepository<License> {
  constructor(db: Db) {
    super(db, COLLECTIONS.LICENSES, "License");
  }

  async findByInstanceId(
    instanceId: string,
  ): Promise<WithStringId<License> | null> {
    return this.findOne({ instanceId });
  }

  async findActiveLicense(
    instanceId: string,
  ): Promise<WithStringId<License> | null> {
    return this.findOne({
      instanceId,
      status: { $in: ["ACTIVE", "TRIAL"] },
      expiresAt: { $gt: new Date() },
    });
  }

  async markValidated(licenseId: string): Promise<void> {
    await this.collection.updateOne(
      { licenseId },
      { $set: { lastValidatedAt: new Date(), updatedAt: new Date() } },
    );
  }
}
