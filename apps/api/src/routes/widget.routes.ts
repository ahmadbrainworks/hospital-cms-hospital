import { Router } from "express";
import { Db } from "mongodb";
import { COLLECTIONS } from "@hospital-cms/database";
import { optionalAuthenticate } from "../middleware/authenticate";

export function widgetRouter(_db: Db): Router {
  const router = Router();

  // GET /widgets — list active widgets for this hospital (public, no auth)
  router.get("/", optionalAuthenticate, async (req, res, next) => {
    try {
      const hospitalId = req.context?.hospitalId;
      if (!hospitalId) {
        return res.status(400).json({ error: "hospitalId required" });
      }

      const widgets = await _db
        .collection(COLLECTIONS.WIDGET_ASSIGNMENTS)
        .find({ hospitalId, status: "active" })
        .toArray();

      res.json(widgets);
    } catch (err) {
      next(err);
    }
  });

  // GET /widgets/:widgetId/bundle/:filename — serve widget assets (public, no auth)
  router.get("/:widgetId/bundle/*", async (req, res, next) => {
    try {
      const { widgetId } = req.params;
      const filename = req.params[0]; // Everything after /bundle/

      const widget = await _db
        .collection(COLLECTIONS.WIDGET_ASSIGNMENTS)
        .findOne({ widgetId, status: "active" });

      if (!widget) {
        return res.status(404).send("Widget not found or inactive");
      }

      // Serve file with path traversal guard
      const { resolve, relative } = await import("node:path");
      const basePath = widget.installPath as string;
      const fullPath = resolve(basePath, filename);
      const relPath = relative(basePath, fullPath);

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
  });

  // GET /widgets/:widgetId/zone/:zoneId — serve widget wrapper HTML (public, no auth)
  router.get("/:widgetId/zone/:zoneId", optionalAuthenticate, async (req, res, next) => {
    try {
      const { widgetId, zoneId } = req.params;
      const hospitalId = req.context?.hospitalId;

      if (!hospitalId) {
        return res.status(400).send("<!-- hospitalId required -->");
      }

      const widget = await _db
        .collection(COLLECTIONS.WIDGET_ASSIGNMENTS)
        .findOne({ widgetId, zone: zoneId, status: "active" });

      if (!widget) {
        return res.status(404).send("<!-- Widget not found or inactive -->");
      }

      const apiUrl = process.env["API_PUBLIC_URL"] || req.protocol + "://" + req.get("host");

      // Return HTML wrapper that loads the widget component
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
            window.__widgetContext = {
              widgetId: ${JSON.stringify(widgetId)},
              zone: ${JSON.stringify(zoneId)},
              hospitalId: ${JSON.stringify(hospitalId)},
              apiUrl: ${JSON.stringify(apiUrl)},
              resize: function(height) {
                parent.postMessage({ type: "resize", height }, "*");
              }
            };
          </script>
          <script src="/api/v1/widgets/${widgetId}/bundle/${widget.componentPath}"></script>
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
