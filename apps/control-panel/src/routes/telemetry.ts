import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { TelemetryBatch, TelemetryEventCategory } from "@hospital-cms/contracts";
import type { TelemetryService } from "../services/telemetry.service";

const CATEGORIES = ["auth", "patient", "billing", "system", "package", "license", "security"] as const;

const IngestSchema = z.object({
  instanceId: z.string(),
  batchAt: z.string(),
  events: z.array(
    z.object({
      eventId: z.string(),
      instanceId: z.string(),
      category: z.enum(CATEGORIES),
      action: z.string(),
      severity: z.enum(["info", "warn", "error", "critical"]),
      occurredAt: z.string(),
      meta: z.record(z.union([z.string(), z.number(), z.boolean()])),
    }),
  ),
});

const QuerySchema = z.object({
  instanceId: z.string().optional(),
  category: z.enum(CATEGORIES).optional(),
  from: z.string(),
  to: z.string(),
  bucketMinutes: z.coerce.number().int().min(1).max(1440).optional(),
});

export function createTelemetryRouter(
  telemetryService: TelemetryService,
): Router {
  const router = Router();

  // POST /ingest — agent pushes a batch of events
  router.post(
    "/ingest",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const batch = IngestSchema.parse(req.body) as TelemetryBatch;
        await telemetryService.ingest(batch);
        res.json({ success: true, data: { accepted: batch.events.length } });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /query — time-series query
  router.get(
    "/query",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = QuerySchema.parse(req.query);
        const result = await telemetryService.query({
          instanceId: params.instanceId,
          category: params.category as TelemetryEventCategory | undefined,
          from: new Date(params.from),
          to: new Date(params.to),
          bucketMinutes: params.bucketMinutes,
        });
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /recent/:instanceId — recent events feed
  router.get(
    "/recent/:instanceId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const limit = Math.min(parseInt(req.query["limit"] as string) || 50, 200);
        const category = req.query["category"] as TelemetryEventCategory | undefined;
        const events = await telemetryService.getRecent(
          req.params["instanceId"]!,
          limit,
          category,
        );
        res.json({ success: true, data: events });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /summary/:instanceId — severity counts
  router.get(
    "/summary/:instanceId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const hours = parseInt(req.query["hours"] as string) || 24;
        const since = new Date(Date.now() - hours * 3600_000);
        const summary = await telemetryService.getSummary(
          req.params["instanceId"]!,
          since,
        );
        res.json({ success: true, data: summary });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
