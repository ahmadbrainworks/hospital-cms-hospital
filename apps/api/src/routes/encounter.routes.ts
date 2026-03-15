import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { sendSuccess, sendCreated, sendPaginated } from "../helpers/response";
import {
  Permission,
  EncounterType,
  EncounterStatus,
} from "@hospital-cms/shared-types";
import { EncounterRepository, CounterService } from "@hospital-cms/database";
import { AuditService } from "@hospital-cms/audit";
import { AuditAction } from "@hospital-cms/shared-types";

const createEncounterSchema = z.object({
  patientId: z.string().min(1),
  type: z.nativeEnum(EncounterType),
  chiefComplaint: z.string().min(1).max(1000),
  assignedDoctor: z.string().optional(),
  ward: z.string().optional(),
  bedNumber: z.string().optional(),
  notes: z.string().optional(),
});

const updateEncounterSchema = z.object({
  status: z.nativeEnum(EncounterStatus).optional(),
  assignedDoctor: z.string().optional(),
  assignedNurse: z.string().optional(),
  ward: z.string().optional(),
  bedNumber: z.string().optional(),
  notes: z.string().optional(),
});

export function encounterRouter(db: Db): Router {
  const router = Router();
  const repo = new EncounterRepository(db);
  const counter = new CounterService(db);
  const auditService = new AuditService(db);

  router.use(authenticate);

  // GET /encounters
  router.get(
    "/",
    requirePermission(Permission.ENCOUNTER_READ),
    async (req, res, next) => {
      try {
        const status = req.query["status"] as EncounterStatus | undefined;
        const patientId = req.query["patientId"] as string | undefined;
        const page = parseInt((req.query["page"] as string) ?? "1");
        const limit = parseInt((req.query["limit"] as string) ?? "20");

        let result;
        if (patientId) {
          result = await repo.findByPatient(
            req.context.hospitalId!,
            patientId,
            { page, limit },
          );
        } else if (status) {
          result = await repo.findByStatus(req.context.hospitalId!, status, {
            page,
            limit,
          });
        } else {
          result = await repo.findMany(
            { hospitalId: req.context.hospitalId! } as Parameters<
              typeof repo.findMany
            >[0],
            { page, limit },
          );
        }
        sendPaginated(res, result, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /encounters/:id
  router.get(
    "/:id",
    requirePermission(Permission.ENCOUNTER_READ),
    async (req, res, next) => {
      try {
        const encounter = await repo.findByIdOrThrow(req.params["id"]!);
        sendSuccess(res, encounter, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /encounters
  router.post(
    "/",
    requirePermission(Permission.ENCOUNTER_CREATE),
    async (req, res, next) => {
      try {
        const body = createEncounterSchema.parse(req.body);
        const hospitalId = req.context.hospitalId!;
        const encounterNumber = await counter.nextEncounterNumber(hospitalId);

        const encounter = await repo.insertOne({
          hospitalId,
          patientId: body.patientId,
          encounterNumber,
          type: body.type,
          status: EncounterStatus.REGISTERED,
          admittedAt: new Date(),
          chiefComplaint: body.chiefComplaint,
          assignedDoctor: body.assignedDoctor,
          ward: body.ward,
          bedNumber: body.bedNumber,
          notes: body.notes,
          createdBy: req.context.userId!,
        });

        await auditService.log({
          hospitalId,
          traceId: req.context.traceId,
          action: AuditAction.ENCOUNTER_CREATED,
          actor: {
            userId: req.context.userId!,
            username: req.context.username!,
            role: req.context.role!,
          },
          resource: {
            type: "Encounter",
            id: encounter._id,
            name: encounterNumber,
          },
          outcome: "SUCCESS",
        });

        sendCreated(res, encounter, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /encounters/:id
  router.patch(
    "/:id",
    requirePermission(Permission.ENCOUNTER_UPDATE),
    async (req, res, next) => {
      try {
        const body = updateEncounterSchema.parse(req.body);
        const before = await repo.findByIdOrThrow(req.params["id"]!);
        const encounter = await repo.updateById(
          req.params["id"]!,
          body as Parameters<typeof repo.updateById>[1],
        );

        if (body.status && body.status !== before.status) {
          await auditService.log({
            hospitalId: req.context.hospitalId!,
            traceId: req.context.traceId,
            action: AuditAction.ENCOUNTER_STATUS_CHANGED,
            actor: {
              userId: req.context.userId!,
              username: req.context.username!,
              role: req.context.role!,
            },
            resource: { type: "Encounter", id: req.params["id"]! },
            changes: {
              before: { status: before.status },
              after: { status: body.status },
              fields: ["status"],
            },
            outcome: "SUCCESS",
          });
        }

        sendSuccess(res, encounter, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
