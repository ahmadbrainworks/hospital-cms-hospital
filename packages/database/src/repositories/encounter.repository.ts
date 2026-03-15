import { Db } from "mongodb";
import type {
  Encounter,
  EncounterStatus,
  EncounterType,
} from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

export class EncounterRepository extends BaseRepository<Encounter> {
  constructor(db: Db) {
    super(db, COLLECTIONS.ENCOUNTERS, "Encounter");
  }

  async findByEncounterNumber(
    hospitalId: string,
    encounterNumber: string,
  ): Promise<WithStringId<Encounter> | null> {
    return this.findOne({ hospitalId, encounterNumber });
  }

  async findByPatient(
    hospitalId: string,
    patientId: string,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany({ hospitalId, patientId }, opts);
  }

  async findActiveByPatient(
    hospitalId: string,
    patientId: string,
  ): Promise<WithStringId<Encounter> | null> {
    return this.findOne({
      hospitalId,
      patientId,
      status: {
        $nin: ["DISCHARGED", "CANCELLED"],
      },
    });
  }

  async findByStatus(
    hospitalId: string,
    status: EncounterStatus,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany({ hospitalId, status }, opts);
  }

  async findByDoctor(
    hospitalId: string,
    doctorId: string,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany(
      {
        hospitalId,
        assignedDoctor: doctorId,
        status: { $nin: ["DISCHARGED", "CANCELLED"] },
      },
      opts,
    );
  }
}
