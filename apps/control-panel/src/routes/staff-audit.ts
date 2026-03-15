/**
 * Staff audit log routes.
 *
 * GET /            — paginated audit log query with filters
 * GET /actions     — distinct action types for filter dropdowns
 * GET /stats       — action counts grouped by type (last N hours)
 */
import { Router, Request, Response, NextFunction } from "express";
import { StaffAuditService } from "../services/staff-audit.service";
import { requireStaffAuth } from "../middleware/staff-auth";
import { requirePermission } from "../middleware/staff-authorize";
import { VendorPermission } from "../types/vendor-auth";

export function createStaffAuditRouter(
  auditService: StaffAuditService,
): Router {
  const router = Router();

  // All audit routes require auth + audit:view
  router.use(requireStaffAuth);
  router.use(requirePermission(VendorPermission.AUDIT_VIEW));

  // GET / — paginated query
  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          staffId,
          action,
          from,
          to,
          limit: limitStr,
          offset: offsetStr,
        } = req.query as Record<string, string | undefined>;

        const result = await auditService.query({
          staffId,
          action,
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
          limit: limitStr ? parseInt(limitStr, 10) : undefined,
          offset: offsetStr ? parseInt(offsetStr, 10) : undefined,
        });

        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /actions — distinct action types
  router.get(
    "/actions",
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const actions = await auditService.getDistinctActions();
        res.json({ success: true, data: actions });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /stats — grouped counts
  router.get(
    "/stats",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const hoursParam = req.query['hours'] as string | undefined;
        const hours = hoursParam ? parseInt(hoursParam, 10) : 24;
        const stats = await auditService.getStats(hours);
        res.json({ success: true, data: stats });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
