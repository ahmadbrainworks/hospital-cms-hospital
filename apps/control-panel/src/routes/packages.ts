import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PackageRegistryService } from "../services/package-registry.service";
import type { PackageAssignmentService } from "../services/package-assignment.service";

const publishSchema = z.object({
  manifest: z.object({}).passthrough(),
  archivePath: z.string().min(1),
});

export function createPackagesRouter(
  packageService: PackageRegistryService,
  assignmentService: PackageAssignmentService,
): Router {
  const router = Router();

  // GET /api/vendor/packages — list all packages
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = typeof req.query["type"] === "string" ? req.query["type"] : undefined;
      const packages = await packageService.list(type);
      res.json({ success: true, data: packages });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/vendor/packages/:packageId — list versions of a package
  router.get("/:packageId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const versions = await packageService.listVersions(req.params["packageId"]!);
      res.json({ success: true, data: versions });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/vendor/packages/:packageId/:version/manifest — get signed manifest
  router.get(
    "/:packageId/:version/manifest",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const manifest = await packageService.getManifest(
          req.params["packageId"]!,
          req.params["version"]!,
        );
        res.json({ success: true, data: manifest });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/vendor/packages — publish a new package
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { manifest, archivePath } = publishSchema.parse(req.body);
      const pkg = await packageService.publish(manifest as never, archivePath);
      res.status(201).json({ success: true, data: pkg });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/vendor/packages/:packageId/assignments — hospitals using this package
  router.get(
    "/:packageId/assignments",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const assignments = await assignmentService.getForPackage(req.params["packageId"]!);
        const count = await assignmentService.countActiveForPackage(req.params["packageId"]!);
        res.json({ success: true, data: { assignments, activeCount: count } });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /api/vendor/packages/:packageId/:version — yank a version
  router.delete(
    "/:packageId/:version",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await packageService.yank(req.params["packageId"]!, req.params["version"]!);
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
