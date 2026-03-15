import { Db } from "mongodb";
import type { Invoice, BillingStatus } from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

export class InvoiceRepository extends BaseRepository<Invoice> {
  constructor(db: Db) {
    super(db, COLLECTIONS.INVOICES, "Invoice");
  }

  async findByInvoiceNumber(
    hospitalId: string,
    invoiceNumber: string,
  ): Promise<WithStringId<Invoice> | null> {
    return this.findOne({ hospitalId, invoiceNumber });
  }

  async findByPatient(
    hospitalId: string,
    patientId: string,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany({ hospitalId, patientId }, opts);
  }

  async findByEncounter(
    hospitalId: string,
    encounterId: string,
  ): Promise<WithStringId<Invoice>[]> {
    const result = await this.findMany({ hospitalId, encounterId });
    return result.items;
  }

  async findOutstanding(
    hospitalId: string,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany(
      {
        hospitalId,
        status: { $in: ["ISSUED", "PARTIAL"] },
        amountDue: { $gt: 0 },
      },
      opts,
    );
  }
}
