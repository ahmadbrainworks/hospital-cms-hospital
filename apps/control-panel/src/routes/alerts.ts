import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ValidationError } from "@hospital-cms/errors";
import { requireStaffAuth } from "../middleware/staff-auth";
import { requirePermission } from "../middleware/staff-authorize";
import { VendorPermission } from "../types/vendor-auth";
import type { AlertEngineService } from "../services/alert-engine.service";

const CreateRuleSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  instanceFilter: z.union([z.array(z.string()), z.literal("*")]),
  condition: z.object({
    type: z.enum(["metric_threshold", "heartbeat_missing", "package_failed", "license_expiry_approaching"]),
  }).passthrough(),
  durationMinutes: z.number().int().min(0).default(0),
  severity: z.enum(["critical", "warning", "info"]),
  cooldownMinutes: z.number().int().min(1).default(60),
});

export function createAlertsRouter(alertEngine: AlertEngineService): Router {
  const router = Router();

  // GET /alerts — list alerts
  router.get(
    "/",
    requireStaffAuth,
    requirePermission(VendorPermission.ALERT_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const alerts = await alertEngine.listAlerts({
          status: req.query["status"] as string | undefined,
          severity: req.query["severity"] as string | undefined,
          instanceId: req.query["instanceId"] as string | undefined,
          limit: req.query["limit"] ? parseInt(req.query["limit"] as string, 10) : undefined,
        });
        res.json({ success: true, data: alerts });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /alerts/active — active alerts only
  router.get(
    "/active",
    requireStaffAuth,
    requirePermission(VendorPermission.ALERT_VIEW),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const alerts = await alertEngine.getActiveAlerts();
        res.json({ success: true, data: alerts });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /alerts/count — active alert count (for sidebar badge)
  router.get(
    "/count",
    requireStaffAuth,
    requirePermission(VendorPermission.ALERT_VIEW),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const count = await alertEngine.getActiveAlertCount();
        res.json({ success: true, data: { count } });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /alerts/:alertId/ack — acknowledge
  router.put(
    "/:alertId/ack",
    requireStaffAuth,
    requirePermission(VendorPermission.ALERT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await alertEngine.acknowledgeAlert(
          req.params["alertId"]!,
          req.staffContext!.staffId,
        );
        res.json({ success: true, data: null });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /alert-rules — list rules
  router.get(
    "/rules",
    requireStaffAuth,
    requirePermission(VendorPermission.ALERT_VIEW),
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const rules = await alertEngine.listRules();
        res.json({ success: true, data: rules });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /alert-rules — create rule
  router.post(
    "/rules",
    requireStaffAuth,
    requirePermission(VendorPermission.ALERT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = CreateRuleSchema.parse(req.body);
        const rule = await alertEngine.createRule({
          ...body,
          createdBy: req.staffContext!.staffId,
        } as any);
        res.status(201).json({ success: true, data: rule });
      } catch (err) {
        if (err instanceof z.ZodError) return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  // PUT /alert-rules/:ruleId — update rule
  router.put(
    "/rules/:ruleId",
    requireStaffAuth,
    requirePermission(VendorPermission.ALERT_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await alertEngine.updateRule(req.params["ruleId"]!, req.body);
        res.json({ success: true, data: null });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
