import { Db } from "mongodb";
import type { Doctor } from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

export class DoctorRepository extends BaseRepository<Doctor> {
  constructor(db: Db) {
    super(db, COLLECTIONS.DOCTORS, "Doctor");
  }

  async findByEmail(
    hospitalId: string,
    email: string,
  ): Promise<WithStringId<Doctor> | null> {
    return this.findOne({
      hospitalId,
      email: email.toLowerCase(),
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
