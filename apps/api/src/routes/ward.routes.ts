import { Router } from "express";
import { Db, Filter, ObjectId } from "mongodb";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import {
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from "../helpers/response";
import { COLLECTIONS, WardRepository } from "@hospital-cms/database";
import { ConflictError, NotFoundError, ValidationError } from "@hospital-cms/errors";
import { EncounterStatus, Permission, type Ward } from "@hospital-cms/shared-types";

const wardGenderSchema = z.enum(["MALE", "FEMALE", "MIXED"]);

const createWardSchema = z
  .object({
    name: z.string().min(1).max(100),
    code: z.string().max(40).optional(),
    description: z.string().max(1000).optional(),
    gender: wardGenderSchema.default("MIXED"),
    bedStart: z.number().int().min(1),
    bedEnd: z.number().int().min(1),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.bedEnd < value.bedStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bedEnd must be greater than or equal to bedStart",
        path: ["bedEnd"],
      });
    }
  });

const updateWardSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    code: z.string().max(40).optional(),
    description: z.string().max(1000).optional(),
    gender: wardGenderSchema.optional(),
    bedStart: z.number().int().min(1).optional(),
    bedEnd: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.bedStart !== undefined &&
      value.bedEnd !== undefined &&
      value.bedEnd < value.bedStart
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bedEnd must be greater than or equal to bedStart",
        path: ["bedEnd"],
      });
    }
  });

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBedNumber(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export function wardRouter(db: Db): Router {
  const router = Router();
  const repo = new WardRepository(db);

  router.use(authenticate);

  // GET /wards
  router.get(
    "/",
    requirePermission(Permission.ENCOUNTER_READ),
    async (req, res, next) => {
      try {
        const hospitalId = req.context.hospitalId!;
        const q = ((req.query["q"] as string) ?? "").trim();
        const activeOnly = (req.query["activeOnly"] as string) !== "false";
        const page = parseInt((req.query["page"] as string) ?? "1");
        const limit = parseInt((req.query["limit"] as string) ?? "20");

        const filter: Parameters<typeof repo.findMany>[0] = {
          hospitalId,
          deletedAt: { $exists: false },
          ...(activeOnly ? { isActive: true } : {}),
        } as Parameters<typeof repo.findMany>[0];

        if (q) {
          const rx = new RegExp(escapeRegex(q), "i");
          (filter as Record<string, unknown>)["$or"] = [
            { name: { $regex: rx } },
            { code: { $regex: rx } },
            { description: { $regex: rx } },
          ];
        }

        const result = await repo.findMany(filter, { page, limit });
        sendPaginated(res, result, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /wards/:id/beds
  router.get(
    "/:id/beds",
    requirePermission(Permission.ENCOUNTER_READ),
    async (req, res, next) => {
      try {
        const wardId = req.params["id"]!;
        const hospitalId = req.context.hospitalId!;
        const ward = await repo.findByIdOrThrow(wardId);
        if (ward.hospitalId !== hospitalId) {
          throw new NotFoundError("Ward", wardId);
        }

        const encounterId = (req.query["encounterId"] as string | undefined)?.trim();
        const encounterFilter: Filter<Record<string, unknown>> = {
          hospitalId,
          ward: ward.name,
          bedNumber: { $exists: true, $ne: "" },
          status: {
            $nin: [EncounterStatus.DISCHARGED, EncounterStatus.CANCELLED],
          },
        };

        if (encounterId && ObjectId.isValid(encounterId)) {
          encounterFilter["_id"] = { $ne: new ObjectId(encounterId) };
        }

        const occupied = await db
          .collection(COLLECTIONS.ENCOUNTERS)
          .find(encounterFilter)
          .project({ _id: 1, patientId: 1, encounterNumber: 1, bedNumber: 1 })
          .toArray();

        const occupiedMap = new Map<
          number,
          { encounterId: string; encounterNumber?: string; patientId?: string }
        >();

        for (const row of occupied) {
          const bedNumber = parseBedNumber(row["bedNumber"]);
          if (!bedNumber) continue;
          occupiedMap.set(bedNumber, {
            encounterId: String(row["_id"]),
            encounterNumber:
              typeof row["encounterNumber"] === "string"
                ? row["encounterNumber"]
                : undefined,
            patientId: typeof row["patientId"] === "string" ? row["patientId"] : undefined,
          });
        }

        const beds: Array<{
          bedNumber: number;
          isAvailable: boolean;
          assigned?: { encounterId: string; encounterNumber?: string; patientId?: string };
        }> = [];

        for (let n = ward.bedStart; n <= ward.bedEnd; n++) {
          const assigned = occupiedMap.get(n);
          beds.push({
            bedNumber: n,
            isAvailable: !assigned,
            ...(assigned ? { assigned } : {}),
          });
        }

        sendSuccess(
          res,
          {
            ward: {
              _id: ward._id,
              name: ward.name,
              gender: ward.gender,
              bedStart: ward.bedStart,
              bedEnd: ward.bedEnd,
            },
            summary: {
              totalBeds: beds.length,
              occupiedBeds: beds.filter((b) => !b.isAvailable).length,
              availableBeds: beds.filter((b) => b.isAvailable).length,
            },
            beds,
          },
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /wards
  router.post(
    "/",
    requirePermission(Permission.SYSTEM_SETTINGS_WRITE),
    async (req, res, next) => {
      try {
        const hospitalId = req.context.hospitalId!;
        const body = createWardSchema.parse(req.body);

        const name = body.name.trim();
        const existing = await repo.findByName(hospitalId, name);
        if (existing) {
          throw new ConflictError(`Ward '${name}' already exists`);
        }

        const ward = await repo.insertOne({
          hospitalId,
          name,
          code: body.code?.trim(),
          description: body.description?.trim(),
          gender: body.gender,
          bedStart: body.bedStart,
          bedEnd: body.bedEnd,
          isActive: body.isActive,
        } satisfies Omit<Ward, "_id" | "createdAt" | "updatedAt">);

        sendCreated(res, ward, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /wards/:id
  router.patch(
    "/:id",
    requirePermission(Permission.SYSTEM_SETTINGS_WRITE),
    async (req, res, next) => {
      try {
        const hospitalId = req.context.hospitalId!;
        const wardId = req.params["id"]!;
        const body = updateWardSchema.parse(req.body);
        const before = await repo.findByIdOrThrow(wardId);

        if (before.hospitalId !== hospitalId) {
          throw new NotFoundError("Ward", wardId);
        }

        const nextName = body.name?.trim() ?? before.name;
        const nextStart = body.bedStart ?? before.bedStart;
        const nextEnd = body.bedEnd ?? before.bedEnd;
        if (nextEnd < nextStart) {
          throw new ValidationError("bedEnd must be greater than or equal to bedStart");
        }

        if (nextName !== before.name) {
          const existing = await repo.findByName(hospitalId, nextName);
          if (existing && existing._id !== wardId) {
            throw new ConflictError(`Ward '${nextName}' already exists`);
          }
        }

        const activeEncounterFilter: Filter<Record<string, unknown>> = {
          hospitalId,
          ward: before.name,
          bedNumber: { $exists: true, $ne: "" },
          status: {
            $nin: [EncounterStatus.DISCHARGED, EncounterStatus.CANCELLED],
          },
        };

        const activeAssignments = await db
          .collection(COLLECTIONS.ENCOUNTERS)
          .find(activeEncounterFilter)
          .project({ bedNumber: 1 })
          .toArray();

        const outOfRangeAssigned = activeAssignments.some((a) => {
          const bed = parseBedNumber(a["bedNumber"]);
          return bed !== null && (bed < nextStart || bed > nextEnd);
        });
        if (outOfRangeAssigned) {
          throw new ConflictError(
            "Cannot shrink ward bed range while active encounters are assigned outside the new range",
          );
        }

        const updates: Partial<Omit<Ward, "_id" | "createdAt">> = {
          ...(body.name !== undefined && { name: nextName }),
          ...(body.code !== undefined && { code: body.code.trim() }),
          ...(body.description !== undefined && { description: body.description.trim() }),
          ...(body.gender !== undefined && { gender: body.gender }),
          ...(body.bedStart !== undefined && { bedStart: body.bedStart }),
          ...(body.bedEnd !== undefined && { bedEnd: body.bedEnd }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        };

        const updated = await repo.updateById(
          wardId,
          updates as Parameters<typeof repo.updateById>[1],
        );

        if (nextName !== before.name) {
          await db.collection(COLLECTIONS.ENCOUNTERS).updateMany(
            { hospitalId, ward: before.name },
            { $set: { ward: nextName } },
          );
        }

        sendSuccess(res, updated, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /wards/:id
  router.delete(
    "/:id",
    requirePermission(Permission.SYSTEM_SETTINGS_WRITE),
    async (req, res, next) => {
      try {
        const hospitalId = req.context.hospitalId!;
        const wardId = req.params["id"]!;
        const ward = await repo.findByIdOrThrow(wardId);
        if (ward.hospitalId !== hospitalId) {
          throw new NotFoundError("Ward", wardId);
        }

        const activeEncounter = await db.collection(COLLECTIONS.ENCOUNTERS).findOne({
          hospitalId,
          ward: ward.name,
          status: {
            $nin: [EncounterStatus.DISCHARGED, EncounterStatus.CANCELLED],
          },
        });
        if (activeEncounter) {
          throw new ConflictError(
            `Ward '${ward.name}' cannot be deleted while active encounters are assigned`,
          );
        }

        await repo.softDeleteById(wardId, req.context.userId!);
        sendNoContent(res);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
