import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ValidationError } from "@hospital-cms/errors";
import type { InstanceService } from "../services/instance.service";
import type { LicenseService } from "../services/license.service";
import type { CommandService } from "../services/command.service";

const RegisterSchema = z.object({
  hospitalName: z.string().min(2).max(100),
  hospitalSlug: z.string().regex(/^[a-z0-9-]+$/),
  publicKey: z.string().min(100),
  agentVersion: z.string(),
});

const DesiredStateSchema = z.object({
  plugins: z
    .array(
      z.object({
        pluginId: z.string(),
        version: z.string(),
        enabled: z.boolean(),
        packageUrl: z.string().url(),
        packageHash: z.string(),
        signature: z.string(),
      }),
    )
    .optional(),
  theme: z
    .object({
      themeId: z.string(),
      version: z.string(),
      packageUrl: z.string().url(),
      packageHash: z.string(),
      signature: z.string(),
    })
    .nullable()
    .optional(),
  config: z.record(z.string()).optional(),
});

const CommandSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

export function createInstancesRouter(
  instanceService: InstanceService,
  licenseService: LicenseService,
  commandService: CommandService,
): Router {
  const router = Router();

  // POST /instances — register new instance (called by installer)
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = RegisterSchema.parse(req.body);
      const instance = await instanceService.register(body);
      res.status(201).json({ success: true, data: { instance } });
    } catch (err) {
      if (err instanceof z.ZodError)
        return next(new ValidationError(err.message));
      next(err);
    }
  });

  // GET /instances — list all (vendor only)
  router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const instances = await instanceService.listAll();
      res.json({ success: true, data: { instances, total: instances.length } });
    } catch (err) {
      next(err);
    }
  });

  // GET /instances/:instanceId
  router.get(
    "/:instanceId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const instance = await instanceService.getByInstanceId(
          req.params["instanceId"]!,
        );
        const license = await licenseService.getActiveForInstance(
          instance.instanceId,
        );
        const pendingCommands = await commandService.getPendingForInstance(
          instance.instanceId,
        );
        res.json({
          success: true,
          data: {
            instance,
            license,
            pendingCommandCount: pendingCommands.length,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /instances/:instanceId/desired-state — update desired state
  router.put(
    "/:instanceId/desired-state",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = DesiredStateSchema.parse(req.body);
        const instance = await instanceService.updateDesiredState(
          req.params["instanceId"]!,
          body as any,
        );
        res.json({
          success: true,
          data: { desiredState: instance.desiredState },
        });
      } catch (err) {
        if (err instanceof z.ZodError)
          return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  // POST /instances/:instanceId/commands — issue command
  router.post(
    "/:instanceId/commands",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = CommandSchema.parse(req.body);
        const command = await commandService.issue(
          req.params["instanceId"]!,
          body.type,
          body.payload ?? {},
        );
        res.status(201).json({ success: true, data: { command } });
      } catch (err) {
        if (err instanceof z.ZodError)
          return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  // GET /instances/:instanceId/commands — list commands
  router.get(
    "/:instanceId/commands",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const commands = await commandService.listForInstance(
          req.params["instanceId"]!,
        );
        res.json({ success: true, data: { commands } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
