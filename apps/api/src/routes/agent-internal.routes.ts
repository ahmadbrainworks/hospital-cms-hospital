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
import { broadcastToHospital } from "../modules/sse/sse-manager";
import { _resetLicenseCache } from "../middleware/license-guard";

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

const WidgetApplySchema = z.object({
  hospitalId: z.string().min(1),
  widgetId: z.string().min(1),
  version: z.string(),
  zone: z.string(),
  componentPath: z.string(),
  manifestJson: z.string(),
  packageBase64: z.string(),
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

        // Emit plugin slot update event to trigger frontend refresh
        const manifest_ = manifest as any;
        broadcastToHospital(body.hospitalId, "plugin.slots.updated", {
          pluginId: manifest_?.pluginId || (plugin as any)?.pluginId,
          slots: manifest_?.uiSlots || [],
          status: "active",
        });

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

        broadcastToHospital(body.hospitalId, "theme.changed", {
          themeId: assignment.themeId,
          v: Date.now(),
        });

        res.status(200).json({ success: true, data: assignment });
      } catch (err) {
        if (err instanceof z.ZodError) return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  /**
   * POST /api/agent/apply-widget
   * Agent pushes a widget package for installation.
   */
  router.post(
    "/apply-widget",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = WidgetApplySchema.parse(req.body);

        // Upsert widget assignment record
        const assignment = await db.collection("widget_assignments").findOneAndUpdate(
          {
            hospitalId: body.hospitalId,
            widgetId: body.widgetId,
          },
          {
            $set: {
              hospitalId: body.hospitalId,
              widgetId: body.widgetId,
              version: body.version,
              zone: body.zone,
              componentPath: body.componentPath,
              status: "active",
              manifestJson: body.manifestJson,
              installPath: `/widgets/${body.widgetId}/${body.version}`,
              installedAt: new Date(),
              installedBy: body.actorId,
            },
          },
          { upsert: true, returnDocument: "after" },
        );

        logger.info(
          { hospitalId: body.hospitalId, widgetId: body.widgetId },
          "Agent installed widget",
        );

        // Emit widget zone update event
        broadcastToHospital(body.hospitalId, "widget.zone.updated", {
          zone: body.zone,
          widgetId: body.widgetId,
          action: "installed",
        });

        res.status(200).json({ success: true, data: assignment.value });
      } catch (err) {
        if (err instanceof z.ZodError) return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  /**
   * POST /api/agent/deactivate-plugin
   * Agent deactivates a plugin by ID.
   */
  router.post(
    "/deactivate-plugin",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { hospitalId, pluginId } = z
          .object({
            hospitalId: z.string().min(1),
            pluginId: z.string().min(1),
          })
          .parse(req.body);

        await pluginRegistry.deactivate(hospitalId, pluginId);

        logger.info(
          { hospitalId, pluginId },
          "Agent deactivated plugin",
        );

        res.json({ success: true, data: { pluginId, status: "deactivated" } });
      } catch (err) {
        if (err instanceof z.ZodError) return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  /**
   * POST /api/agent/remove-theme
   * Agent removes the active theme, reverting to default.
   */
  router.post(
    "/remove-theme",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { hospitalId } = z
          .object({ hospitalId: z.string().min(1) })
          .parse(req.body);

        themeRegistry.invalidateCache(hospitalId);

        logger.info(
          { hospitalId },
          "Agent removed active theme",
        );

        res.json({ success: true, data: { message: "Theme reverted to default" } });
      } catch (err) {
        if (err instanceof z.ZodError) return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  /**
   * POST /api/agent/apply-config
   * Agent applies configuration key-value pairs.
   */
  router.post(
    "/apply-config",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { config } = z
          .object({
            config: z.record(z.string(), z.unknown()),
          })
          .parse(req.body);

        await db
          .collection("hospital_instance")
          .updateOne({}, { $set: { config, configUpdatedAt: new Date() } });

        logger.info(
          { keys: Object.keys(config) },
          "Agent applied config",
        );

        res.json({ success: true, data: { applied: Object.keys(config).length } });
      } catch (err) {
        if (err instanceof z.ZodError) return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  /**
   * POST /api/agent/clear-cache
   * Agent clears the license cache (called when CP revokes license).
   */
  router.post(
    "/clear-cache",
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        _resetLicenseCache();
        logger.info("Agent cleared license cache");
        res.json({ success: true, data: { message: "Cache cleared" } });
      } catch (err) {
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
