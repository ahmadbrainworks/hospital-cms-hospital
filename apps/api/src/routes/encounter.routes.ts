import { Router } from "express";
import { Db, Filter, ObjectId } from "mongodb";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { sendSuccess, sendCreated, sendPaginated } from "../helpers/response";
import {
  Permission,
  EncounterType,
  EncounterStatus,
} from "@hospital-cms/shared-types";
import {
  COLLECTIONS,
  EncounterRepository,
  CounterService,
  DoctorRepository,
  PatientRepository,
  WardRepository,
} from "@hospital-cms/database";
import { AuditService } from "@hospital-cms/audit";
import { AuditAction, type Ward } from "@hospital-cms/shared-types";
import { ConflictError, NotFoundError, ValidationError } from "@hospital-cms/errors";
import { globalEventBus } from "@hospital-cms/plugin-runtime";

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
  const doctorRepo = new DoctorRepository(db);
  const wardRepo = new WardRepository(db);
  const patientRepo = new PatientRepository(db);
  const auditService = new AuditService(db);

  const normalizeInput = (value?: string): string | undefined => {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  };

  const findWardByName = async (
    hospitalId: string,
    wardName: string,
  ): Promise<Ward & { _id: string }> => {
    const candidates = await wardRepo.findMany(
      {
        hospitalId,
        deletedAt: { $exists: false },
        isActive: true,
        name: { $regex: new RegExp(`^${wardName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      } as Parameters<typeof wardRepo.findMany>[0],
      { page: 1, limit: 1 },
    );

    const ward = candidates.items[0];
    if (!ward) throw new NotFoundError("Ward", wardName);
    return ward;
  };

  const validateDoctor = async (
    hospitalId: string,
    doctorId?: string,
  ): Promise<string | undefined> => {
    const assignedDoctor = normalizeInput(doctorId);
    if (!assignedDoctor) return undefined;
    const doctor = await doctorRepo.findById(assignedDoctor);
    if (
      !doctor ||
      doctor.hospitalId !== hospitalId ||
      doctor.deletedAt !== undefined ||
      !doctor.isActive
    ) {
      throw new NotFoundError("Doctor", assignedDoctor);
    }
    return assignedDoctor;
  };

  const validateWardAndBed = async (params: {
    hospitalId: string;
    wardName?: string;
    bedNumber?: string;
    excludeEncounterId?: string;
  }): Promise<{ ward?: string; bedNumber?: string }> => {
    const wardName = normalizeInput(params.wardName);
    const bedInput = normalizeInput(params.bedNumber);

    if (bedInput && !wardName) {
      throw new ValidationError("Ward is required when bedNumber is provided");
    }

    if (!wardName) {
      return { ward: undefined, bedNumber: undefined };
    }

    const ward = await findWardByName(params.hospitalId, wardName);

    if (!bedInput) {
      return { ward: ward.name, bedNumber: undefined };
    }

    const bed = parseInt(bedInput, 10);
    if (!Number.isInteger(bed) || bed < 1) {
      throw new ValidationError("bedNumber must be a positive integer");
    }
    if (bed < ward.bedStart || bed > ward.bedEnd) {
      throw new ValidationError(
        `bedNumber must be between ${ward.bedStart} and ${ward.bedEnd} for ward '${ward.name}'`,
      );
    }

    const occupiedFilter: Filter<Record<string, unknown>> = {
      hospitalId: params.hospitalId,
      ward: ward.name,
      bedNumber: String(bed),
      status: {
        $nin: [EncounterStatus.DISCHARGED, EncounterStatus.CANCELLED],
      },
    };

    if (params.excludeEncounterId && ObjectId.isValid(params.excludeEncounterId)) {
      occupiedFilter["_id"] = { $ne: new ObjectId(params.excludeEncounterId) };
    }

    const occupied = await db.collection(COLLECTIONS.ENCOUNTERS).findOne(
      occupiedFilter,
      { projection: { _id: 1, encounterNumber: 1 } },
    );
    if (occupied) {
      throw new ConflictError(`Bed ${bed} in ward '${ward.name}' is already assigned`);
    }

    return {
      ward: ward.name,
      bedNumber: String(bed),
    };
  };

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
        const encounterId = req.params["id"]!;
        const encounter = await repo.findByIdOrThrow(encounterId);
        if (encounter.hospitalId !== req.context.hospitalId!) {
          throw new NotFoundError("Encounter", encounterId);
        }
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
        const assignedDoctor = await validateDoctor(hospitalId, body.assignedDoctor);
        const { ward, bedNumber } = await validateWardAndBed({
          hospitalId,
          wardName: body.ward,
          bedNumber: body.bedNumber,
        });

        const patient = await patientRepo.findById(body.patientId);
        if (
          !patient ||
          patient.hospitalId !== hospitalId ||
          patient.deletedAt !== undefined
        ) {
          throw new NotFoundError("Patient", body.patientId);
        }

        const activeEncounter = await repo.findActiveByPatient(
          hospitalId,
          body.patientId,
        );
        if (activeEncounter) {
          throw new ConflictError("Patient already has an active encounter", {
            patientId: body.patientId,
            encounterId: activeEncounter._id,
            encounterNumber: activeEncounter.encounterNumber,
          });
        }

        const encounterNumber = await counter.nextEncounterNumber(hospitalId);

        const encounter = await repo.insertOne({
          hospitalId,
          patientId: body.patientId,
          encounterNumber,
          type: body.type,
          status: EncounterStatus.REGISTERED,
          admittedAt: new Date(),
          chiefComplaint: body.chiefComplaint,
          assignedDoctor,
          ward,
          bedNumber,
          notes: normalizeInput(body.notes),
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
        const encounterId = req.params["id"]!;
        const before = await repo.findByIdOrThrow(encounterId);
        if (before.hospitalId !== req.context.hospitalId!) {
          throw new NotFoundError("Encounter", encounterId);
        }

        const assignedDoctor =
          body.assignedDoctor !== undefined
            ? await validateDoctor(req.context.hospitalId!, body.assignedDoctor)
            : before.assignedDoctor;

        const wardResult =
          body.ward !== undefined || body.bedNumber !== undefined
            ? await validateWardAndBed({
                hospitalId: req.context.hospitalId!,
                wardName: body.ward ?? before.ward,
                bedNumber: body.bedNumber ?? before.bedNumber,
                excludeEncounterId: encounterId,
              })
            : { ward: before.ward, bedNumber: before.bedNumber };

        const updates = {
          ...(body.status !== undefined && { status: body.status }),
          ...(body.assignedNurse !== undefined && {
            assignedNurse: normalizeInput(body.assignedNurse),
          }),
          ...(body.notes !== undefined && { notes: normalizeInput(body.notes) }),
          ...(body.assignedDoctor !== undefined && { assignedDoctor }),
          ...(body.ward !== undefined && { ward: wardResult.ward }),
          ...(body.bedNumber !== undefined && { bedNumber: wardResult.bedNumber }),
        } as Parameters<typeof repo.updateById>[1];

        const encounter = await repo.updateById(
          encounterId,
          updates,
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
            resource: { type: "Encounter", id: encounterId },
            changes: {
              before: { status: before.status },
              after: { status: body.status },
              fields: ["status"],
            },
            outcome: "SUCCESS",
          });

          // Emit event when encounter is started
          if (body.status === EncounterStatus.ACTIVE) {
            void globalEventBus.emit("encounter.started", {
              hospitalId: req.context.hospitalId,
              encounterId,
              patientId: encounter.patientId,
              encounterNumber: encounter.encounterNumber,
            });
          }
        }

        sendSuccess(res, encounter, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
