import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ValidationError } from "@hospital-cms/errors";
import { requireStaffAuth } from "../middleware/staff-auth";
import { requirePermission } from "../middleware/staff-authorize";
import { VendorPermission } from "../types/vendor-auth";
import type { FeatureFlagService } from "../services/feature-flag.service";

const CreateFlagSchema = z.object({
  flagId: z.string().min(1).regex(/^[a-z0-9_]+$/, "Flag ID must be lowercase alphanumeric with underscores"),
  name: z.string().min(1),
  description: z.string().default(""),
  defaultValue: z.boolean(),
  overrides: z.array(z.object({
    condition: z.object({ type: z.string() }).passthrough(),
    value: z.boolean(),
    reason: z.string(),
  })).default([]),
});

export function createFeatureFlagsRouter(featureFlagService: FeatureFlagService): Router {
  const router = Router();

  // GET / — list all flags
  router.get(
    "/",
    requireStaffAuth,
    requirePermission(VendorPermission.FLAG_VIEW),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const flags = await featureFlagService.list();
        res.json({ success: true, data: flags });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /:flagId — get single flag
  router.get(
    "/:flagId",
    requireStaffAuth,
    requirePermission(VendorPermission.FLAG_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const flag = await featureFlagService.getById(req.params["flagId"]!);
        if (!flag) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Flag not found" } });
        res.json({ success: true, data: flag });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST / — create flag
  router.post(
    "/",
    requireStaffAuth,
    requirePermission(VendorPermission.FLAG_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = CreateFlagSchema.parse(req.body);
        const flag = await featureFlagService.create({
          ...body,
          createdBy: req.staffContext!.staffId,
        } as any);
        res.status(201).json({ success: true, data: flag });
      } catch (err) {
        if (err instanceof z.ZodError) return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  // PUT /:flagId — update flag
  router.put(
    "/:flagId",
    requireStaffAuth,
    requirePermission(VendorPermission.FLAG_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await featureFlagService.update(req.params["flagId"]!, req.body);
        res.json({ success: true, data: null });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:flagId/kill — emergency kill
  router.post(
    "/:flagId/kill",
    requireStaffAuth,
    requirePermission(VendorPermission.FLAG_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await featureFlagService.killFlag(req.params["flagId"]!, req.staffContext!.staffId);
        res.json({ success: true, data: null });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /:flagId/unkill — re-enable after kill
  router.post(
    "/:flagId/unkill",
    requireStaffAuth,
    requirePermission(VendorPermission.FLAG_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await featureFlagService.unkillFlag(req.params["flagId"]!, req.staffContext!.staffId);
        res.json({ success: true, data: null });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /:flagId — delete flag
  router.delete(
    "/:flagId",
    requireStaffAuth,
    requirePermission(VendorPermission.FLAG_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await featureFlagService.delete(req.params["flagId"]!);
        res.json({ success: true, data: null });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /resolve/:instanceId — resolve flags for an instance
  router.get(
    "/resolve/:instanceId",
    requireStaffAuth,
    requirePermission(VendorPermission.FLAG_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const resolved = await featureFlagService.resolveFlags(req.params["instanceId"]!);
        res.json({ success: true, data: resolved });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
