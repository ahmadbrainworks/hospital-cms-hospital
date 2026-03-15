import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ValidationError } from "@hospital-cms/errors";
import { requireStaffAuth } from "../middleware/staff-auth";
import { requirePermission } from "../middleware/staff-authorize";
import { VendorPermission } from "../types/vendor-auth";
import type { RolloutService } from "../services/rollout.service";

const CreateRolloutSchema = z.object({
  packageId: z.string().min(1),
  version: z.string().min(1),
  waves: z.array(z.object({
    instanceIds: z.array(z.string()),
    tierFilter: z.array(z.string()).optional(),
    percentage: z.number().min(0).max(100).optional(),
    scheduledAt: z.string(),
  })).min(1),
});

export function createRolloutsRouter(rolloutService: RolloutService): Router {
  const router = Router();

  // GET / — list rollouts
  router.get(
    "/",
    requireStaffAuth,
    requirePermission(VendorPermission.ROLLOUT_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rollouts = await rolloutService.list({
          packageId: req.query["packageId"] as string | undefined,
        });
        res.json({ success: true, data: rollouts });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /:rolloutId — get rollout detail
  router.get(
    "/:rolloutId",
    requireStaffAuth,
    requirePermission(VendorPermission.ROLLOUT_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rollout = await rolloutService.getById(req.params["rolloutId"]!);
        res.json({ success: true, data: rollout });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST / — create rollout
  router.post(
    "/",
    requireStaffAuth,
    requirePermission(VendorPermission.ROLLOUT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = CreateRolloutSchema.parse(req.body);
        const rollout = await rolloutService.createRollout({
          ...body,
          createdBy: req.staffContext!.staffId,
        });
        res.status(201).json({ success: true, data: rollout });
      } catch (err) {
        if (err instanceof z.ZodError) return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  // POST /:rolloutId/advance — deploy next wave
  router.post(
    "/:rolloutId/advance",
    requireStaffAuth,
    requirePermission(VendorPermission.ROLLOUT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const wave = await rolloutService.advanceRollout(req.params["rolloutId"]!);
        res.json({ success: true, data: wave });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:rolloutId/pause — pause rollout
  router.post(
    "/:rolloutId/pause",
    requireStaffAuth,
    requirePermission(VendorPermission.ROLLOUT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await rolloutService.pauseRollout(req.params["rolloutId"]!);
        res.json({ success: true, data: null });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:rolloutId/resume — resume rollout
  router.post(
    "/:rolloutId/resume",
    requireStaffAuth,
    requirePermission(VendorPermission.ROLLOUT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await rolloutService.resumeRollout(req.params["rolloutId"]!);
        res.json({ success: true, data: null });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:rolloutId/cancel — cancel rollout
  router.post(
    "/:rolloutId/cancel",
    requireStaffAuth,
    requirePermission(VendorPermission.ROLLOUT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await rolloutService.cancelRollout(req.params["rolloutId"]!);
        res.json({ success: true, data: null });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
