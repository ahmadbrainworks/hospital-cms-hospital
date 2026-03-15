import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { DesiredStateService } from "../services/desired-state.service";

const publishSchema = z.object({
  packages: z
    .array(
      z.object({
        packageId: z.string(),
        version: z.string().optional(),
        action: z.enum(["install", "update", "remove", "pin"]),
      }),
    )
    .optional(),
  config: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  featureFlags: z.record(z.boolean()).optional(),
  maintenanceWindow: z
    .object({ startAt: z.string(), endAt: z.string() })
    .optional(),
});

export function createDesiredStateRouter(
  desiredStateService: DesiredStateService,
): Router {
  const router = Router();

  // GET /api/vendor/desired-state — list all instance desired states
  router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const states = await desiredStateService.listAll();
      res.json({ success: true, data: states });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/vendor/desired-state/:instanceId
  router.get("/:instanceId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const state = await desiredStateService.getForInstance(req.params["instanceId"]!);
      res.json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/vendor/desired-state/:instanceId — publish/update desired state
  router.post("/:instanceId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch = publishSchema.parse(req.body) as any;
      const state = await desiredStateService.publish(req.params["instanceId"]!, patch);
      res.status(201).json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/vendor/desired-state/:instanceId/reconciliation
  router.get(
    "/:instanceId/reconciliation",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const history = await desiredStateService.getReconciliationHistory(
          req.params["instanceId"]!,
        );
        res.json({ success: true, data: history });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
