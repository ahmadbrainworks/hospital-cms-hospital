import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { agentOnly } from "../middleware/agent-only";
import { sendSuccess } from "../helpers/response";
import { Permission } from "@hospital-cms/shared-types";
import { ThemeRegistry } from "@hospital-cms/theme-engine";
import { ValidationError } from "@hospital-cms/errors";
import { getConfig } from "@hospital-cms/config";

const ActivateSchema = z.object({
  manifestJson: z.string(),
  signature: z.string(),
});

export function themeRouter(db: Db): Router {
  const router = Router();
  const cfg = getConfig();
  const registry = new ThemeRegistry(db, cfg.VENDOR_PUBLIC_KEY);

  router.use(authenticate);

  // GET /themes/active — get active theme for hospital
  router.get(
    "/active",
    requirePermission(Permission.SYSTEM_THEMES_MANAGE),
    async (req, res, next) => {
      try {
        const theme = await registry.getActiveTheme(req.context.hospitalId!);
        sendSuccess(res, theme, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /themes/active/css — serve compiled CSS for the active theme
  router.get(
    "/active/css",
    // No auth required — browser fetches CSS directly
    async (req, res, next) => {
      try {
        // hospitalId comes from query param for unauthenticated CSS endpoint
        const hospitalId =
          (req.query["hospitalId"] as string) ?? req.context?.hospitalId;
        if (!hospitalId) {
          res.status(400).send("/* hospitalId required */");
          return;
        }
        const css = await registry.getActiveCss(hospitalId);
        res.setHeader("Content-Type", "text/css");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.send(css);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /themes/activate — activate a signed theme
  // In production, only the local management agent can activate themes.
  router.post(
    "/activate",
    agentOnly("POST /themes/activate"),
    requirePermission(Permission.SYSTEM_THEMES_MANAGE),
    async (req, res, next) => {
      try {
        const body = ActivateSchema.parse(req.body);
        let manifest: unknown;
        try {
          manifest = JSON.parse(body.manifestJson);
        } catch {
          return next(new ValidationError("manifestJson must be valid JSON"));
        }

        const assignment = await registry.activateTheme({
          hospitalId: req.context.hospitalId!,
          manifest,
          actorId: req.context.userId!,
        });
        void body.signature;
        sendSuccess(res, assignment, 200, undefined, req.context.traceId);
      } catch (err) {
        if (err instanceof z.ZodError)
          return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  // DELETE /themes/active — revert to default theme (agent-only in production)
  router.delete(
    "/active",
    agentOnly("DELETE /themes/active"),
    requirePermission(Permission.SYSTEM_THEMES_MANAGE),
    async (req, res, next) => {
      try {
        registry.invalidateCache(req.context.hospitalId!);
        sendSuccess(
          res,
          { message: "Theme reverted to default" },
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
