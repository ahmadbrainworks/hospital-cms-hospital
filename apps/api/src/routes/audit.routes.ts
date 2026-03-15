import { Router } from "express";
import { Db } from "mongodb";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { sendPaginated, sendSuccess } from "../helpers/response";
import { Permission, AuditAction } from "@hospital-cms/shared-types";
import { AuditService } from "@hospital-cms/audit";

export function auditRouter(db: Db): Router {
  const router = Router();
  const auditService = new AuditService(db);

  router.use(authenticate);

  // GET /audit/logs
  router.get(
    "/logs",
    requirePermission(Permission.AUDIT_READ),
    async (req, res, next) => {
      try {
        const query = {
          actorId: req.query["actorId"] as string | undefined,
          resourceType: req.query["resourceType"] as string | undefined,
          resourceId: req.query["resourceId"] as string | undefined,
          action: req.query["action"] as AuditAction | undefined,
          page: parseInt((req.query["page"] as string) ?? "1"),
          limit: parseInt((req.query["limit"] as string) ?? "20"),
        };

        const result = await auditService.search(
          req.context.hospitalId!,
          query,
        );
        sendPaginated(res, result, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /audit/integrity
  router.get(
    "/integrity",
    requirePermission(Permission.AUDIT_EXPORT),
    async (req, res, next) => {
      try {
        const result = await auditService.verifyChainIntegrity(
          req.context.hospitalId!,
        );
        sendSuccess(res, result, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
