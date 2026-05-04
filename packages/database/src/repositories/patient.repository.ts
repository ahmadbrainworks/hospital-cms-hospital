import { Db, ObjectId } from "mongodb";
import type { Patient } from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

export class PatientRepository extends BaseRepository<Patient> {
  constructor(db: Db) {
    super(db, COLLECTIONS.PATIENTS, "Patient");
  }

  async findByMrn(
    hospitalId: string,
    mrn: string,
  ): Promise<WithStringId<Patient> | null> {
    return this.findOne({
      hospitalId,
      mrn: mrn.toUpperCase(),
      deletedAt: { $exists: false },
    });
  }

  async findByPatientNumber(
    hospitalId: string,
    patientNumber: string,
  ): Promise<WithStringId<Patient> | null> {
    return this.findOne({
      hospitalId,
      patientNumber,
      deletedAt: { $exists: false },
    });
  }

  async searchPatients(
    hospitalId: string,
    query: string,
    opts?: { page?: number; limit?: number },
  ) {
    const q = query.trim();
    if (!q) {
      return this.findMany({ hospitalId, deletedAt: { $exists: false } }, opts);
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");

    const filter: Parameters<typeof this.findMany>[0] = {
      hospitalId,
      deletedAt: { $exists: false },
      $or: [
        { patientNumber: { $regex: regex } },
        { mrn: { $regex: regex } },
        { "profile.firstName": { $regex: regex } },
        { "profile.lastName": { $regex: regex } },
        { "profile.nationalId": { $regex: regex } },
        { "contactInfo.phone": { $regex: regex } },
      ],
    } as Parameters<typeof this.findMany>[0];

    if (ObjectId.isValid(q)) {
      (filter as Record<string, unknown>)["$or"] = [
        ...((filter as Record<string, unknown>)["$or"] as unknown[]),
        { _id: new ObjectId(q) },
      ];
    }

    return this.findMany(
      filter,
      opts,
    );
  }

  async mrnExists(hospitalId: string, mrn: string): Promise<boolean> {
    return this.exists({
      hospitalId,
      mrn: mrn.toUpperCase(),
      deletedAt: { $exists: false },
    });
  }

  async nextPatientNumber(hospitalId: string): Promise<string> {
    void hospitalId;
    // Delegate to counter collection — called from service layer.
    // Stub for type safety; actual logic in PatientService.
    throw new Error("Call PatientService.generatePatientNumber() instead");
  }
}
