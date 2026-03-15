import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { sendSuccess, sendCreated, sendPaginated } from "../helpers/response";
import {
  Permission,
  LabOrderStatus,
  AuditAction,
} from "@hospital-cms/shared-types";
import { BaseRepository, CounterService } from "@hospital-cms/database";
import { COLLECTIONS } from "@hospital-cms/database";
import { AuditService } from "@hospital-cms/audit";

const createLabOrderSchema = z.object({
  patientId: z.string().min(1),
  encounterId: z.string().min(1),
  tests: z
    .array(
      z.object({
        testCode: z.string().min(1),
        testName: z.string().min(1),
      }),
    )
    .min(1),
  priority: z.enum(["ROUTINE", "URGENT", "STAT"]).default("ROUTINE"),
  notes: z.string().optional(),
});

const resultSchema = z.object({
  testCode: z.string().min(1),
  result: z.string().min(1),
  unit: z.string().optional(),
  referenceRange: z.string().optional(),
  isAbnormal: z.boolean().optional(),
  resultNotes: z.string().optional(),
});

export function labRouter(db: Db): Router {
  const router = Router();
  const collection = db.collection(COLLECTIONS.LAB_ORDERS);
  const counter = new CounterService(db);
  const auditService = new AuditService(db);

  router.use(authenticate);

  // GET /lab/orders
  router.get(
    "/orders",
    requirePermission(Permission.LAB_ORDER_READ),
    async (req, res, next) => {
      try {
        const hospitalId = req.context.hospitalId!;
        const page = parseInt((req.query["page"] as string) ?? "1");
        const limit = parseInt((req.query["limit"] as string) ?? "20");
        const skip = (page - 1) * limit;

        const [orders, total] = await Promise.all([
          collection
            .find({ hospitalId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
          collection.countDocuments({ hospitalId }),
        ]);

        sendPaginated(
          res,
          {
            items: orders.map((o) => ({
              ...o,
              _id: o["_id"].toHexString(),
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

  // POST /lab/orders
  router.post(
    "/orders",
    requirePermission(Permission.LAB_ORDER_CREATE),
    async (req, res, next) => {
      try {
        const body = createLabOrderSchema.parse(req.body);
        const hospitalId = req.context.hospitalId!;
        const orderNumber = await counter.nextLabOrderNumber(hospitalId);
        const now = new Date();

        const doc = {
          hospitalId,
          patientId: body.patientId,
          encounterId: body.encounterId,
          orderNumber,
          status: LabOrderStatus.ORDERED,
          orderedBy: req.context.userId!,
          orderedAt: now,
          tests: body.tests,
          priority: body.priority,
          notes: body.notes,
          createdAt: now,
          updatedAt: now,
        };

        const result = await collection.insertOne(doc);
        const order = await collection.findOne({ _id: result.insertedId });

        sendCreated(
          res,
          { ...order, _id: order?.["_id"].toHexString() },
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /lab/orders/:id/results
  router.post(
    "/orders/:id/results",
    requirePermission(Permission.LAB_RESULT_WRITE),
    async (req, res, next) => {
      try {
        const results = z.array(resultSchema).parse(req.body.results);
        const { ObjectId } = await import("mongodb");
        const id = new ObjectId(req.params["id"]!);

        const order = await collection.findOne({ _id: id });
        if (!order) {
          res.status(404).json({
            success: false,
            error: { code: "NOT_FOUND", message: "Lab order not found" },
          });
          return;
        }

        const now = new Date();
        const updatedTests = (order["tests"] as Record<string, unknown>[]).map(
          (test) => {
            const result = results.find((r) => r.testCode === test["testCode"]);
            if (!result) return test;
            return {
              ...test,
              ...result,
              resultedAt: now,
              resultedBy: req.context.userId!,
            };
          },
        );

        const allCompleted = updatedTests.every((t) => t["result"]);

        await collection.updateOne(
          { _id: id },
          {
            $set: {
              tests: updatedTests,
              status: allCompleted
                ? LabOrderStatus.COMPLETED
                : LabOrderStatus.IN_PROGRESS,
              completedAt: allCompleted ? now : undefined,
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
