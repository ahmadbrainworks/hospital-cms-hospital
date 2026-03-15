/**
 * Package assignment routes.
 *
 * Allows vendor staff to assign, update, disable, and remove package
 * assignments for hospital instances. Every mutation auto-rebuilds
 * the desired state.
 */
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireStaffAuth } from "../middleware/staff-auth";
import { requirePermission } from "../middleware/staff-authorize";
import { VendorPermission } from "../types/vendor-auth";
import type { PackageAssignmentService } from "../services/package-assignment.service";

const AssignSchema = z.object({
  instanceId: z.string().min(1),
  packageId: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  config: z.record(z.unknown()).optional(),
  notes: z.string().max(500).optional(),
});

const BulkAssignSchema = z.object({
  instanceIds: z.array(z.string().min(1)).min(1).max(100),
  packageId: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  config: z.record(z.unknown()).optional(),
  notes: z.string().max(500).optional(),
});

const UpdateVersionSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});

export function createPackageAssignmentsRouter(
  assignmentService: PackageAssignmentService,
): Router {
  const router = Router();

  // All routes require staff auth
  router.use(requireStaffAuth);

  // POST /api/vendor/assignments — assign a package to a hospital
  router.post(
    "/",
    requirePermission(VendorPermission.PACKAGE_ASSIGN),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = AssignSchema.parse(req.body);
        const staffId = req.staffContext!.staffId;
        const assignment = await assignmentService.assign(
          body.instanceId,
          body.packageId,
          body.version,
          staffId,
          { config: body.config, notes: body.notes },
        );
        res.status(201).json({ success: true, data: assignment });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/vendor/assignments/bulk — assign a package to multiple hospitals
  router.post(
    "/bulk",
    requirePermission(VendorPermission.PACKAGE_ASSIGN),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = BulkAssignSchema.parse(req.body);
        const staffId = req.staffContext!.staffId;
        const results = await assignmentService.bulkAssign(
          body.instanceIds,
          body.packageId,
          body.version,
          staffId,
          { config: body.config, notes: body.notes },
        );
        res.status(201).json({ success: true, data: { assignments: results, total: results.length } });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /api/vendor/assignments/instance/:instanceId — list assignments for a hospital
  router.get(
    "/instance/:instanceId",
    requirePermission(VendorPermission.INSTANCE_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const includeRemoved = req.query["includeRemoved"] === "true";
        const assignments = await assignmentService.getForInstance(
          req.params["instanceId"]!,
          includeRemoved,
        );
        res.json({ success: true, data: assignments });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /api/vendor/assignments/package/:packageId — list hospitals using a package
  router.get(
    "/package/:packageId",
    requirePermission(VendorPermission.PACKAGE_VIEW),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const includeRemoved = req.query["includeRemoved"] === "true";
        const assignments = await assignmentService.getForPackage(
          req.params["packageId"]!,
          includeRemoved,
        );
        res.json({ success: true, data: assignments });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /api/vendor/assignments/:instanceId/:packageId/version — update assigned version
  router.put(
    "/:instanceId/:packageId/version",
    requirePermission(VendorPermission.PACKAGE_ASSIGN),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = UpdateVersionSchema.parse(req.body);
        const staffId = req.staffContext!.staffId;
        const assignment = await assignmentService.updateVersion(
          req.params["instanceId"]!,
          req.params["packageId"]!,
          body.version,
          staffId,
        );
        res.json({ success: true, data: assignment });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /api/vendor/assignments/:instanceId/:packageId/disable — disable assignment
  router.put(
    "/:instanceId/:packageId/disable",
    requirePermission(VendorPermission.PACKAGE_ASSIGN),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const staffId = req.staffContext!.staffId;
        await assignmentService.disable(
          req.params["instanceId"]!,
          req.params["packageId"]!,
          staffId,
        );
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /api/vendor/assignments/:instanceId/:packageId — remove assignment
  router.delete(
    "/:instanceId/:packageId",
    requirePermission(VendorPermission.PACKAGE_ASSIGN),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const staffId = req.staffContext!.staffId;
        await assignmentService.remove(
          req.params["instanceId"]!,
          req.params["packageId"]!,
          staffId,
        );
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
