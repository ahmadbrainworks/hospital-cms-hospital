import { Router, Request, Response, NextFunction } from "express";
import { Db } from "mongodb";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { optionalAuthenticate } from "../middleware/authenticate";
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

  // GET /plugins/:pluginId/bundle/:filename — serve plugin assets (public, no auth)
  // Bundles are immutable once installed, so aggressive caching is safe
  router.get(
    "/:pluginId/bundle/*",
    async (req, res, next) => {
      try {
        const { pluginId } = req.params;
        const filename = req.params[0]; // Everything after /bundle/

        // Find active plugin for this hospital
        const plugins = await registry.listPlugins(req.context.hospitalId || "");
        const plugin = plugins.find((p) => p.pluginId === pluginId);

        if (!plugin || plugin.status !== "active") {
          return res.status(404).send("Plugin not found or inactive");
        }

        // Serve file from plugin's install path, with path traversal guard
        const { resolve, relative } = await import("node:path");
        const basePath = plugin.installPath;
        const fullPath = resolve(basePath, filename);
        const relPath = relative(basePath, fullPath);

        // Prevent directory traversal attacks
        if (relPath.startsWith("..")) {
          return res.status(403).send("Access denied");
        }

        res.setHeader("Cache-Control", "public, max-age=3600, immutable");
        res.setHeader("Content-Type", "application/javascript");
        res.sendFile(fullPath, (err: any) => {
          if (err) {
            res.status(404).send("File not found");
          }
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /plugins/:pluginId/slot/:slotId — serve plugin slot HTML wrapper (public, no auth)
  router.get("/:pluginId/slot/:slotId", optionalAuthenticate, async (req, res, next) => {
    try {
      const { pluginId, slotId } = req.params;
      const hospitalId = req.context?.hospitalId || (req.query.hospitalId as string);

      if (!hospitalId) {
        return res.status(400).send("<!-- hospitalId required -->");
      }

      // Find active plugin for this hospital
      const plugins = await registry.listPlugins(hospitalId);
      const plugin = plugins.find((p) => p.pluginId === pluginId);

      if (!plugin || plugin.status !== "active") {
        return res.status(404).send("<!-- Plugin not found or inactive -->");
      }

      // Find the UI slot matching the slotId
      const slot = (plugin.manifest as any)?.uiSlots?.find(
        (s: any) => s.slotId === slotId,
      );
      if (!slot) {
        return res.status(404).send("<!-- Slot not found -->");
      }

      const apiUrl = process.env["API_PUBLIC_URL"] || req.protocol + "://" + req.get("host");

      // Return HTML wrapper that loads the plugin component
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          </style>
        </head>
        <body>
          <div id="root"></div>
          <script>
            window.__pluginContext = {
              pluginId: ${JSON.stringify(pluginId)},
              hospitalId: ${JSON.stringify(hospitalId)},
              apiUrl: ${JSON.stringify(apiUrl)},
              slotId: ${JSON.stringify(slotId)},
              resize: function(height) {
                parent.postMessage({ type: "resize", height }, "*");
              }
            };
          </script>
          <script src="/api/v1/plugins/${pluginId}/bundle/${slot.component}"></script>
        </body>
        </html>
      `;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.send(html);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
