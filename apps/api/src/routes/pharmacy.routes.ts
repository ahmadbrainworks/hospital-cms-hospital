import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { sendSuccess, sendCreated, sendPaginated } from "../helpers/response";
import { Permission, AuditAction } from "@hospital-cms/shared-types";
import { COLLECTIONS, CounterService } from "@hospital-cms/database";
import { AuditService } from "@hospital-cms/audit";

const createPrescriptionSchema = z.object({
  patientId: z.string().min(1),
  encounterId: z.string().min(1),
  medications: z
    .array(
      z.object({
        medicationName: z.string().min(1),
        genericName: z.string().optional(),
        dosage: z.string().min(1),
        frequency: z.string().min(1),
        duration: z.string().min(1),
        quantity: z.number().positive().int(),
        instructions: z.string().optional(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});

export function pharmacyRouter(db: Db): Router {
  const router = Router();
  const collection = db.collection(COLLECTIONS.PRESCRIPTIONS);
  const counter = new CounterService(db);
  const auditService = new AuditService(db);

  router.use(authenticate);

  // GET /pharmacy/prescriptions
  router.get(
    "/prescriptions",
    requirePermission(Permission.PHARMACY_INVENTORY_READ),
    async (req, res, next) => {
      try {
        const hospitalId = req.context.hospitalId!;
        const patientId = req.query["patientId"] as string | undefined;
        const page = parseInt((req.query["page"] as string) ?? "1");
        const limit = parseInt((req.query["limit"] as string) ?? "20");
        const skip = (page - 1) * limit;

        const filter = patientId ? { hospitalId, patientId } : { hospitalId };

        const [items, total] = await Promise.all([
          collection
            .find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
          collection.countDocuments(filter),
        ]);

        sendPaginated(
          res,
          {
            items: items.map((i) => ({
              ...i,
              _id: i["_id"].toHexString(),
            })) as Parameters<typeof sendPaginated>[1]["items"],
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /pharmacy/prescriptions
  router.post(
    "/prescriptions",
    requirePermission(Permission.PHARMACY_PRESCRIBE),
    async (req, res, next) => {
      try {
        const body = createPrescriptionSchema.parse(req.body);
        const hospitalId = req.context.hospitalId!;
        const prescriptionNumber =
          await counter.nextPrescriptionNumber(hospitalId);
        const now = new Date();

        const doc = {
          hospitalId,
          patientId: body.patientId,
          encounterId: body.encounterId,
          prescriptionNumber,
          prescribedBy: req.context.userId!,
          prescribedAt: now,
          medications: body.medications,
          status: "PENDING",
          notes: body.notes,
          createdAt: now,
          updatedAt: now,
        };

        const result = await collection.insertOne(doc);
        const prescription = await collection.findOne({
          _id: result.insertedId,
        });
        sendCreated(
          res,
          { ...prescription, _id: prescription?.["_id"].toHexString() },
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /pharmacy/prescriptions/:id/dispense
  router.post(
    "/prescriptions/:id/dispense",
    requirePermission(Permission.PHARMACY_DISPENSE),
    async (req, res, next) => {
      try {
        const { ObjectId } = await import("mongodb");
        const id = new ObjectId(req.params["id"]!);
        const now = new Date();

        await collection.updateOne(
          { _id: id },
          {
            $set: {
              status: "DISPENSED",
              dispensedAt: now,
              dispensedBy: req.context.userId!,
              updatedAt: now,
            },
          },
        );

        const updated = await collection.findOne({ _id: id });
        sendSuccess(
          res,
          { ...updated, _id: updated?.["_id"].toHexString() },
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
