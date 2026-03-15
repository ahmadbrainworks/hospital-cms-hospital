import { Router } from "express";
import { Db } from "mongodb";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { agentOnly } from "../middleware/agent-only";
import { sendSuccess, sendNoContent } from "../helpers/response";
import { Permission } from "@hospital-cms/shared-types";
import { PluginRegistry } from "@hospital-cms/plugin-runtime";
import { ValidationError } from "@hospital-cms/errors";
import { getConfig } from "@hospital-cms/config";

const InstallSchema = z.object({
  manifestJson: z.string(), // JSON string of PluginManifest
  packageBase64: z.string(), // base64-encoded plugin zip
});

export function pluginRouter(db: Db): Router {
  const router = Router();
  const cfg = getConfig();
  const registry = new PluginRegistry(
    db,
    cfg.PLUGIN_STORAGE_PATH,
    cfg.VENDOR_PUBLIC_KEY,
  );

  router.use(authenticate);

  // GET /plugins — list all plugins for this hospital
  router.get(
    "/",
    requirePermission(Permission.SYSTEM_PLUGINS_MANAGE),
    async (req, res, next) => {
      try {
        const plugins = await registry.listPlugins(req.context.hospitalId!);
        sendSuccess(res, plugins, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /plugins — install plugin from signed manifest + package
  // In production, only the local management agent can install plugins.
  router.post(
    "/",
    agentOnly("POST /plugins"),
    requirePermission(Permission.SYSTEM_PLUGINS_MANAGE),
    async (req, res, next) => {
      let tempPluginPath: string | null = null;

      try {
        const body = InstallSchema.parse(req.body);
        let manifest: unknown;
        try {
          manifest = JSON.parse(body.manifestJson);
        } catch {
          return next(new ValidationError("manifestJson must be valid JSON"));
        }

        const packageBuffer = Buffer.from(body.packageBase64, "base64");
        const uploadDir = join(cfg.PLUGIN_STORAGE_PATH, ".uploads");
        await mkdir(uploadDir, { recursive: true });

        tempPluginPath = join(uploadDir, `${randomUUID()}.zip`);
        await writeFile(tempPluginPath, packageBuffer);

        const plugin = await registry.install({
          hospitalId: req.context.hospitalId!,
          manifest,
          pluginFilePath: tempPluginPath,
          actorId: req.context.userId!,
        });
        sendSuccess(res, plugin, 201, undefined, req.context.traceId);
      } catch (err) {
        if (err instanceof z.ZodError)
          return next(new ValidationError(err.message));
        next(err);
      } finally {
        if (tempPluginPath) {
          void rm(tempPluginPath, { force: true }).catch(() => undefined);
        }
      }
    },
  );

  // POST /plugins/:pluginId/activate — agent-only in production
  router.post(
    "/:pluginId/activate",
    agentOnly("POST /plugins/:pluginId/activate"),
    requirePermission(Permission.SYSTEM_PLUGINS_MANAGE),
    async (req, res, next) => {
      try {
        await registry.activate(
          req.context.hospitalId!,
          req.params["pluginId"]!,
        );
        sendSuccess(
          res,
          { pluginId: req.params["pluginId"], status: "active" },
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /plugins/:pluginId/deactivate — agent-only in production
  router.post(
    "/:pluginId/deactivate",
    agentOnly("POST /plugins/:pluginId/deactivate"),
    requirePermission(Permission.SYSTEM_PLUGINS_MANAGE),
    async (req, res, next) => {
      try {
        await registry.deactivate(
          req.context.hospitalId!,
          req.params["pluginId"]!,
        );
        sendSuccess(
          res,
          { pluginId: req.params["pluginId"], status: "disabled" },
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /plugins/:pluginId — uninstall (agent-only in production)
  router.delete(
    "/:pluginId",
    agentOnly("DELETE /plugins/:pluginId"),
    requirePermission(Permission.SYSTEM_PLUGINS_MANAGE),
    async (req, res, next) => {
      try {
        await registry.deactivate(
          req.context.hospitalId!,
          req.params["pluginId"]!,
        );
        sendNoContent(res);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
