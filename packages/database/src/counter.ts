import { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

// COUNTER / SEQUENCE GENERATOR
// Uses findOneAndUpdate with upsert for atomic incrementing.
// Used to generate human-readable sequential IDs.

export class CounterService {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async nextValue(hospitalId: string, name: string): Promise<number> {
    const collection = this.db.collection(COLLECTIONS.COUNTER_SEQUENCES);

    const result = await collection.findOneAndUpdate(
      { hospitalId, name },
      { $inc: { seq: 1 }, $set: { updatedAt: new Date() } },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    return (result as { seq: number } | null)?.seq ?? 1;
  }

  async nextPatientNumber(hospitalId: string): Promise<string> {
    const seq = await this.nextValue(hospitalId, "patient_number");
    return `P${String(seq).padStart(7, "0")}`;
  }

  async nextEncounterNumber(hospitalId: string): Promise<string> {
    const seq = await this.nextValue(hospitalId, "encounter_number");
    const year = new Date().getFullYear();
    return `ENC-${year}-${String(seq).padStart(6, "0")}`;
  }

  async nextInvoiceNumber(hospitalId: string): Promise<string> {
    const seq = await this.nextValue(hospitalId, "invoice_number");
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    return `INV-${year}${month}-${String(seq).padStart(5, "0")}`;
  }

  async nextLabOrderNumber(hospitalId: string): Promise<string> {
    const seq = await this.nextValue(hospitalId, "lab_order_number");
    return `LAB-${String(seq).padStart(7, "0")}`;
  }

  async nextPrescriptionNumber(hospitalId: string): Promise<string> {
    const seq = await this.nextValue(hospitalId, "prescription_number");
    return `RX-${String(seq).padStart(7, "0")}`;
  }
}
