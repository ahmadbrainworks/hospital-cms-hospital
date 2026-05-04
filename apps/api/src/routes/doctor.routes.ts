import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import {
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from "../helpers/response";
import { DoctorRepository } from "@hospital-cms/database";
import { ConflictError, NotFoundError } from "@hospital-cms/errors";
import { Gender, Permission, type Doctor } from "@hospital-cms/shared-types";

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const createDoctorSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  middleName: z.string().max(50).optional(),
  gender: z.nativeEnum(Gender),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  department: z.string().max(100).optional(),
  specialization: z.string().max(100).optional(),
  licenseNumber: z.string().max(100).optional(),
  qualifications: z.array(z.string().min(1).max(120)).default([]),
  photoUrl: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().default(true),
});

const updateDoctorSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  middleName: z.string().max(50).optional(),
  gender: z.nativeEnum(Gender).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  department: z.string().max(100).optional(),
  specialization: z.string().max(100).optional(),
  licenseNumber: z.string().max(100).optional(),
  qualifications: z.array(z.string().min(1).max(120)).optional(),
  photoUrl: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export function doctorRouter(db: Db): Router {
  const router = Router();
  const repo = new DoctorRepository(db);

  router.use(authenticate);

  // GET /doctors
  router.get(
    "/",
    requirePermission(Permission.ENCOUNTER_READ),
    async (req, res, next) => {
      try {
        const hospitalId = req.context.hospitalId!;
        const q = ((req.query["q"] as string) ?? "").trim();
        const page = parseInt((req.query["page"] as string) ?? "1");
        const limit = parseInt((req.query["limit"] as string) ?? "20");
        const activeOnly = (req.query["activeOnly"] as string) !== "false";

        const filter: Parameters<typeof repo.findMany>[0] = {
          hospitalId,
          deletedAt: { $exists: false },
          ...(activeOnly ? { isActive: true } : {}),
        } as Parameters<typeof repo.findMany>[0];

        if (q) {
          const rx = new RegExp(escapeRegex(q), "i");
          (filter as Record<string, unknown>)["$or"] = [
            { firstName: { $regex: rx } },
            { lastName: { $regex: rx } },
            { middleName: { $regex: rx } },
            { email: { $regex: rx } },
            { phone: { $regex: rx } },
            { specialization: { $regex: rx } },
            { licenseNumber: { $regex: rx } },
          ];
        }

        const result = await repo.findMany(filter, { page, limit });
        sendPaginated(res, result, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /doctors/:id
  router.get(
    "/:id",
    requirePermission(Permission.ENCOUNTER_READ),
    async (req, res, next) => {
      try {
        const doctorId = req.params["id"]!;
        const doctor = await repo.findByIdOrThrow(doctorId);
        if (doctor.hospitalId !== req.context.hospitalId!) {
          throw new NotFoundError("Doctor", doctorId);
        }
        sendSuccess(res, doctor, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /doctors
  router.post(
    "/",
    requirePermission(Permission.USER_CREATE),
    async (req, res, next) => {
      try {
        const hospitalId = req.context.hospitalId!;
        const body = createDoctorSchema.parse(req.body);

        if (body.email) {
          const exists = await repo.findByEmail(hospitalId, body.email);
          if (exists) {
            throw new ConflictError(`Doctor email '${body.email}' is already in use`);
          }
        }

        const doctor = await repo.insertOne({
          hospitalId,
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          middleName: body.middleName?.trim(),
          gender: body.gender,
          phone: body.phone?.trim(),
          email: body.email?.trim().toLowerCase(),
          department: body.department?.trim(),
          specialization: body.specialization?.trim(),
          licenseNumber: body.licenseNumber?.trim(),
          qualifications: body.qualifications.map((q) => q.trim()),
          photoUrl: body.photoUrl?.trim(),
          notes: body.notes?.trim(),
          isActive: body.isActive,
        } satisfies Omit<Doctor, "_id" | "createdAt" | "updatedAt">);

        sendCreated(res, doctor, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /doctors/:id
  router.patch(
    "/:id",
    requirePermission(Permission.USER_UPDATE),
    async (req, res, next) => {
      try {
        const doctorId = req.params["id"]!;
        const body = updateDoctorSchema.parse(req.body);
        const before = await repo.findByIdOrThrow(doctorId);
        if (before.hospitalId !== req.context.hospitalId!) {
          throw new NotFoundError("Doctor", doctorId);
        }

        const normalizedEmail = body.email?.trim().toLowerCase();
        if (
          normalizedEmail &&
          normalizedEmail !== before.email?.toLowerCase()
        ) {
          const exists = await repo.findByEmail(req.context.hospitalId!, normalizedEmail);
          if (exists && exists._id !== doctorId) {
            throw new ConflictError(`Doctor email '${normalizedEmail}' is already in use`);
          }
        }

        const updates: Partial<Omit<Doctor, "_id" | "createdAt">> = {
          ...(body.firstName !== undefined && { firstName: body.firstName.trim() }),
          ...(body.lastName !== undefined && { lastName: body.lastName.trim() }),
          ...(body.middleName !== undefined && { middleName: body.middleName.trim() }),
          ...(body.gender !== undefined && { gender: body.gender }),
          ...(body.phone !== undefined && { phone: body.phone.trim() }),
          ...(body.email !== undefined && { email: normalizedEmail }),
          ...(body.department !== undefined && { department: body.department.trim() }),
          ...(body.specialization !== undefined && {
            specialization: body.specialization.trim(),
          }),
          ...(body.licenseNumber !== undefined && {
            licenseNumber: body.licenseNumber.trim(),
          }),
          ...(body.qualifications !== undefined && {
            qualifications: body.qualifications.map((q) => q.trim()),
          }),
          ...(body.photoUrl !== undefined && { photoUrl: body.photoUrl.trim() }),
          ...(body.notes !== undefined && { notes: body.notes.trim() }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        };

        const updated = await repo.updateById(
          doctorId,
          updates as Parameters<typeof repo.updateById>[1],
        );
        sendSuccess(res, updated, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /doctors/:id
  router.delete(
    "/:id",
    requirePermission(Permission.USER_DELETE),
    async (req, res, next) => {
      try {
        const doctorId = req.params["id"]!;
        const doctor = await repo.findByIdOrThrow(doctorId);
        if (doctor.hospitalId !== req.context.hospitalId!) {
          throw new NotFoundError("Doctor", doctorId);
        }
        await repo.softDeleteById(doctorId, req.context.userId!);
        sendNoContent(res);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
