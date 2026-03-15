import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { UserService } from "../modules/user/user.service";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendNoContent,
} from "../helpers/response";
import { Permission, UserRole } from "@hospital-cms/shared-types";
import { BadRequestError } from "@hospital-cms/errors";

const createUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(UserRole),
  profile: z.object({
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    phone: z.string().optional(),
    department: z.string().optional(),
    specialization: z.string().optional(),
    licenseNumber: z.string().optional(),
  }),
});

const updateUserSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  profile: z
    .object({
      firstName: z.string().min(1).max(50).optional(),
      lastName: z.string().min(1).max(50).optional(),
      phone: z.string().optional(),
      department: z.string().optional(),
      specialization: z.string().optional(),
    })
    .optional(),
});

export function userRouter(db: Db): Router {
  const router = Router();
  const userService = new UserService(db);

  // All user routes require authentication
  router.use(authenticate);

  // GET /users
  router.get(
    "/",
    requirePermission(Permission.USER_READ),
    async (req, res, next) => {
      try {
        const page = parseInt((req.query["page"] as string) ?? "1");
        const limit = parseInt((req.query["limit"] as string) ?? "20");
        const result = await userService.listUsers(req.context.hospitalId!, {
          page,
          limit,
        });
        sendPaginated(res, result, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /users/:id
  router.get(
    "/:id",
    requirePermission(Permission.USER_READ),
    async (req, res, next) => {
      try {
        const user = await userService.getUser(
          req.context.hospitalId!,
          req.params["id"]!,
        );
        sendSuccess(res, user, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /users
  router.post(
    "/",
    requirePermission(Permission.USER_CREATE),
    async (req, res, next) => {
      try {
        const body = createUserSchema.parse(req.body);

        const user = await userService.createUser({
          hospitalId: req.context.hospitalId!,
          ...body,
          actorId: req.context.userId!,
          actorUsername: req.context.username!,
          actorRole: req.context.role!,
          traceId: req.context.traceId,
        });

        sendCreated(res, user, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /users/:id
  router.patch(
    "/:id",
    requirePermission(Permission.USER_UPDATE),
    async (req, res, next) => {
      try {
        const body = updateUserSchema.parse(req.body);
        const user = await userService.updateUser(
          req.context.hospitalId!,
          req.params["id"]!,
          body,
          req.context.userId!,
          req.context.username!,
          req.context.role!,
          req.context.traceId,
        );
        sendSuccess(res, user, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /users/:id
  router.delete(
    "/:id",
    requirePermission(Permission.USER_DELETE),
    async (req, res, next) => {
      try {
        if (req.params["id"] === req.context.userId) {
          throw new BadRequestError("You cannot delete your own account.");
        }
        await userService.deleteUser(
          req.context.hospitalId!,
          req.params["id"]!,
          req.context.userId!,
          req.context.username!,
          req.context.role!,
          req.context.traceId,
        );
        sendNoContent(res);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
