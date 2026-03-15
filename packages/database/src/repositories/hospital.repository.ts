import { Db } from "mongodb";
import type { HospitalInstance } from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

export class HospitalRepository extends BaseRepository<HospitalInstance> {
  constructor(db: Db) {
    super(db, COLLECTIONS.HOSPITAL_INSTANCE, "HospitalInstance");
  }

  async findByInstanceId(
    instanceId: string,
  ): Promise<WithStringId<HospitalInstance> | null> {
    return this.findOne({ instanceId });
  }

  async findSingle(): Promise<WithStringId<HospitalInstance> | null> {
    // Single-instance deployment — exactly one document exists.
    return this.findOne({});
  }

  async updateHeartbeat(instanceId: string): Promise<void> {
    await this.collection.updateOne(
      { instanceId },
      { $set: { lastHeartbeatAt: new Date(), updatedAt: new Date() } },
    );
  }

  async setAgentVersion(
    instanceId: string,
    agentVersion: string,
  ): Promise<void> {
    await this.collection.updateOne(
      { instanceId },
      { $set: { agentVersion, updatedAt: new Date() } },
    );
  }

  async isInstalled(): Promise<boolean> {
    return this.exists({ isInstalled: true });
  }
}
