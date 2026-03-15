import { Db } from "mongodb";
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
    if (!query.trim()) {
      return this.findMany({ hospitalId, deletedAt: { $exists: false } }, opts);
    }

    return this.findMany(
      {
        hospitalId,
        deletedAt: { $exists: false },
        $text: { $search: query },
      },
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
