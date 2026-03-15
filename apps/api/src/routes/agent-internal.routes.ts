/**
 * Agent-internal routes.
 *
 * These endpoints are called by the local management agent to apply
 * verified packages (plugins/themes) and report status. They are
 * protected by the agentOnly middleware — no user JWT is needed.
 *
 * Mounted at /api/agent/... outside the licensed API router so they
 * are not gated by user auth or license checks (the agent handles
 * its own license verification via the lease model).
 */
import { Router, Request, Response, NextFunction } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "@hospital-cms/logger";
import { agentOnly } from "../middleware/agent-only";
import { getConfig } from "@hospital-cms/config";
import { PluginRegistry } from "@hospital-cms/plugin-runtime";
import { ThemeRegistry } from "@hospital-cms/theme-engine";
import { ValidationError } from "@hospital-cms/errors";

const logger = createLogger({ module: "AgentInternalRoutes" });

const PluginApplySchema = z.object({
  hospitalId: z.string().min(1),
  manifestJson: z.string(),
  packageBase64: z.string(),
  actorId: z.string().default("agent"),
});

const ThemeApplySchema = z.object({
  hospitalId: z.string().min(1),
  manifestJson: z.string(),
  actorId: z.string().default("agent"),
});

const StatusSchema = z.object({
  agentVersion: z.string(),
  uptime: z.number(),
  lastReconciliation: z.string().optional(),
  errors: z.array(z.string()).optional(),
});

export function agentInternalRouter(db: Db): Router {
  const router = Router();
  const cfg = getConfig();

  // All agent-internal routes require the shared secret
  router.use(agentOnly("agent-internal"));

  const pluginRegistry = new PluginRegistry(
    db,
    cfg.PLUGIN_STORAGE_PATH,
    cfg.VENDOR_PUBLIC_KEY,
  );
  const themeRegistry = new ThemeRegistry(db, cfg.VENDOR_PUBLIC_KEY);

  /**
   * POST /api/agent/apply-plugin
   * Agent pushes a vendor-signed, verified plugin for installation.
   */
  router.post(
    "/apply-plugin",
    async (req: Request, res: Response, next: NextFunction) => {
      let tempPluginPath: string | null = null;
      try {
        const body = PluginApplySchema.parse(req.body);
        let manifest: unknown;
        try {
          manifest = JSON.parse(body.manifestJson);
        } catch {
          return next(new ValidationError("manifestJson must be valid JSON"));
        }

        const packageBuffer = Buffer.from(body.packageBase64, "base64");
        const uploadDir = join(cfg.PLUGIN_STORAGE_PATH, ".agent-uploads");
        await mkdir(uploadDir, { recursive: true });
        tempPluginPath = join(uploadDir, `${randomUUID()}.zip`);
        await writeFile(tempPluginPath, packageBuffer);

        const plugin = await pluginRegistry.install({
          hospitalId: body.hospitalId,
          manifest,
          pluginFilePath: tempPluginPath,
          actorId: body.actorId,
        });

        logger.info(
          { hospitalId: body.hospitalId, pluginId: (plugin as any)?.pluginId },
          "Agent installed plugin",
        );
        res.status(201).json({ success: true, data: plugin });
      } catch (err) {
        if (err instanceof z.ZodError) return next(new ValidationError(err.message));
        next(err);
      } finally {
        if (tempPluginPath) {
          void rm(tempPluginPath, { force: true }).catch(() => undefined);
        }
      }
    },
  );

  /**
   * POST /api/agent/apply-theme
   * Agent pushes a vendor-signed theme manifest for activation.
   */
  router.post(
    "/apply-theme",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = ThemeApplySchema.parse(req.body);
        let manifest: unknown;
        try {
          manifest = JSON.parse(body.manifestJson);
        } catch {
          return next(new ValidationError("manifestJson must be valid JSON"));
        }

        const assignment = await themeRegistry.activateTheme({
          hospitalId: body.hospitalId,
          manifest,
          actorId: body.actorId,
        });

        logger.info(
          { hospitalId: body.hospitalId },
          "Agent activated theme",
        );
        res.status(200).json({ success: true, data: assignment });
      } catch (err) {
        if (err instanceof z.ZodError) return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  /**
   * POST /api/agent/status
   * Agent reports its own status (version, uptime, errors).
   */
  router.post(
    "/status",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = StatusSchema.parse(req.body);
        await db.collection("agent_status").updateOne(
          {},
          { $set: { ...body, reportedAt: new Date() } },
          { upsert: true },
        );
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
