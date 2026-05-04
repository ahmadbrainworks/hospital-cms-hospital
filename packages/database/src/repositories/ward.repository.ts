import { Db } from "mongodb";
import type { Ward } from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

export class WardRepository extends BaseRepository<Ward> {
  constructor(db: Db) {
    super(db, COLLECTIONS.WARDS, "Ward");
  }

  async findByName(
    hospitalId: string,
    name: string,
  ): Promise<WithStringId<Ward> | null> {
    return this.findOne({
      hospitalId,
      name,
      deletedAt: { $exists: false },
    });
  }

  async listByHospital(
    hospitalId: string,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany(
      { hospitalId, deletedAt: { $exists: false } },
      opts,
    );
  }

  async listActiveByHospital(
    hospitalId: string,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany(
      { hospitalId, isActive: true, deletedAt: { $exists: false } },
      opts,
    );
  }
}
