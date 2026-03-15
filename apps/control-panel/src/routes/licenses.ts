import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ValidationError } from "@hospital-cms/errors";
import type { LicenseService } from "../services/license.service";

const IssueSchema = z.object({
  instanceId: z.string().uuid(),
  tier: z.enum(["community", "professional", "enterprise"]),
  validDays: z.number().int().min(1).max(3650).default(365),
});

const RevokeSchema = z.object({
  reason: z.string().min(1).default("Revoked by vendor staff"),
});

export function createLicensesRouter(licenseService: LicenseService): Router {
  const router = Router();

  // GET /licenses — list all licenses
  router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const licenses = await licenseService.listAll();
      res.json({ success: true, data: licenses });
    } catch (err) {
      next(err);
    }
  });

  // POST /licenses — issue license
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Accept both "tier" and "plan" from the frontend
      const raw = req.body as Record<string, unknown>;
      if (raw["plan"] && !raw["tier"]) {
        raw["tier"] = raw["plan"];
      }
      const body = IssueSchema.parse(raw);
      const license = await licenseService.issue(
        body.instanceId,
        body.tier,
        body.validDays,
      );
      res.status(201).json({ success: true, data: { license } });
    } catch (err) {
      if (err instanceof z.ZodError)
        return next(new ValidationError(err.message));
      next(err);
    }
  });

  // GET /licenses/instance/:instanceId — get active license for instance
  router.get(
    "/instance/:instanceId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const license = await licenseService.getActiveForInstance(
          req.params["instanceId"]!,
        );
        res.json({ success: true, data: { license } });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /licenses/instance/:instanceId/history — all licenses for instance
  router.get(
    "/instance/:instanceId/history",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const licenses = await licenseService.listForInstance(
          req.params["instanceId"]!,
        );
        res.json({ success: true, data: { licenses } });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /licenses/:licenseId/revoke — revoke (used by vendor dashboard)
  router.post(
    "/:licenseId/revoke",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = RevokeSchema.parse(req.body);
        await licenseService.revoke(req.params["licenseId"]!, body.reason);
        res.json({ success: true, data: null });
      } catch (err) {
        if (err instanceof z.ZodError)
          return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  // DELETE /licenses/:licenseId — revoke (alternative)
  router.delete(
    "/:licenseId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = RevokeSchema.parse(req.body);
        await licenseService.revoke(req.params["licenseId"]!, body.reason);
        res.json({ success: true, data: null });
      } catch (err) {
        if (err instanceof z.ZodError)
          return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  return router;
}
