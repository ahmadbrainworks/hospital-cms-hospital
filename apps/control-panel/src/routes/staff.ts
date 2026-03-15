/**
 * Staff management routes.
 *
 * GET    /             — list all staff
 * POST   /             — create a staff account
 * GET    /:staffId     — get staff by ID
 * PATCH  /:staffId     — update staff (displayName, role, status)
 * POST   /:staffId/reset-password — admin password reset
 * POST   /:staffId/unlock         — unlock a locked account
 */
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { StaffService } from "../services/staff.service";
import { requireStaffAuth } from "../middleware/staff-auth";
import { requirePermission } from "../middleware/staff-authorize";
import { VendorPermission, VendorRole, VendorStaffStatus } from "../types/vendor-auth";

const CreateStaffSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(50).regex(/^[a-zA-Z0-9_.-]+$/),
  displayName: z.string().min(1).max(100),
  password: z.string().min(8),
  role: z.nativeEnum(VendorRole),
});

const UpdateStaffSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  role: z.nativeEnum(VendorRole).optional(),
  status: z.nativeEnum(VendorStaffStatus).optional(),
});

const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

export function createStaffRouter(staffService: StaffService): Router {
  const router = Router();

  // All staff routes require authentication
  router.use(requireStaffAuth);

  // GET / — list staff
  router.get(
    "/",
    requirePermission(VendorPermission.STAFF_VIEW),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const staff = await staffService.listStaff();
        res.json({ success: true, data: staff });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST / — create staff
  router.post(
    "/",
    requirePermission(VendorPermission.STAFF_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = CreateStaffSchema.parse(req.body);
        const ctx = req.staffContext!;
        const created = await staffService.createStaff({
          ...body,
          createdBy: ctx.staffId,
          ipAddress: req.ip ?? "unknown",
        });
        res.status(201).json({ success: true, data: created });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /:staffId
  router.get(
    "/:staffId",
    requirePermission(VendorPermission.STAFF_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const staff = await staffService.getStaffById(req.params['staffId']!);
        res.json({ success: true, data: staff });
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /:staffId
  router.patch(
    "/:staffId",
    requirePermission(VendorPermission.STAFF_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = UpdateStaffSchema.parse(req.body);
        const ctx = req.staffContext!;
        const updated = await staffService.updateStaff(
          req.params['staffId']!,
          body,
          ctx.staffId,
          req.ip ?? "unknown",
        );
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:staffId/reset-password
  router.post(
    "/:staffId/reset-password",
    requirePermission(VendorPermission.STAFF_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = ResetPasswordSchema.parse(req.body);
        const ctx = req.staffContext!;
        await staffService.resetPassword(
          req.params['staffId']!,
          body.newPassword,
          ctx.staffId,
          req.ip ?? "unknown",
        );
        res.json({ success: true, data: { message: "Password reset successfully" } });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:staffId/unlock
  router.post(
    "/:staffId/unlock",
    requirePermission(VendorPermission.STAFF_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = req.staffContext!;
        await staffService.unlockStaff(
          req.params['staffId']!,
          ctx.staffId,
          req.ip ?? "unknown",
        );
        res.json({ success: true, data: { message: "Account unlocked" } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
