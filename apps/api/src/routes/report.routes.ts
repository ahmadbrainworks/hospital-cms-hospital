/**
 * Report routes
 *
 * GET /api/v1/reports/generate?type=billing_summary&format=csv&from=...&to=...
 *
 * Requires ADMIN role (report:generate permission) and api_access feature flag.
 */
import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { Permission } from "@hospital-cms/shared-types";
import { generateReport, ReportType, ReportFormat } from "../modules/reports/report-builder";
import { ValidationError } from "@hospital-cms/errors";

const querySchema = z.object({
  type: z.enum(["billing_summary", "lab_turnaround", "census", "encounter_summary"]),
  format: z.enum(["csv", "json"]).default("csv"),
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export function reportRouter(db: Db): Router {
  const router = Router();

  // All report routes require auth
  router.use(authenticate);

  // GET /reports/generate — stream report as CSV or JSON
  router.get(
    "/generate",
    requirePermission(Permission.REPORT_GENERATE),
    async (req, res, next) => {
      try {
        const parsed = querySchema.safeParse(req.query);
        if (!parsed.success) {
          throw new ValidationError("Invalid report parameters", {
            errors: parsed.error.flatten().fieldErrors,
          });
        }

        const { type, format, from, to } = parsed.data;
        const fromDate = new Date(from);
        const toDate = new Date(to);

        if (fromDate > toDate) {
          throw new ValidationError("'from' must be before 'to'");
        }

        const result = await generateReport(db, {
          hospitalId: req.context.hospitalId!,
          type: type as ReportType,
          format: format as ReportFormat,
          from: fromDate,
          to: toDate,
        });

        res.setHeader("Content-Type", result.contentType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${result.filename}"`,
        );
        res.send(result.body);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /reports/types — list available report types
  router.get("/types", requirePermission(Permission.REPORT_GENERATE), (_req, res) => {
    res.json({
      success: true,
      data: [
        {
          id: "billing_summary",
          label: "Billing Summary",
          description: "Invoice totals grouped by status",
          formats: ["csv", "json"],
        },
        {
          id: "lab_turnaround",
          label: "Lab Turnaround Times",
          description: "Average lab result processing times by test type",
          formats: ["csv", "json"],
        },
        {
          id: "census",
          label: "Daily Census",
          description: "Admissions and discharges by date",
          formats: ["csv", "json"],
        },
        {
          id: "encounter_summary",
          label: "Encounter Summary",
          description: "Encounter counts by type and status",
          formats: ["csv", "json"],
        },
      ],
    });
  });

  return router;
}
