/**
 * Agent-only middleware.
 *
 * Gates sensitive package-management routes (plugin install, theme activate)
 * so they can only be called by the local management agent in production.
 *
 * The agent sends `X-Agent-Secret` header matching the `AGENT_SECRET` env var
 * that is shared between the API and the agent on the same host.
 *
 * In development mode the guard logs a warning and allows the request through
 * so manual testing via curl/Postman is still possible.
 */
import { Request, Response, NextFunction } from "express";
import { createLogger } from "@hospital-cms/logger";
import { ForbiddenError } from "@hospital-cms/errors";

const logger = createLogger({ module: "AgentOnlyGuard" });

const AGENT_SECRET = process.env["AGENT_SECRET"] ?? "";

/**
 * Middleware that rejects requests not originating from the local agent.
 *
 * @param label - Human-readable label for log messages (e.g. "POST /plugins")
 */
export function agentOnly(label?: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Allow CORS preflight requests to pass through
    if (req.method === "OPTIONS") {
      return next();
    }

    const provided = req.headers["x-agent-secret"] as string | undefined;

    // In development, warn but allow through
    if (process.env["NODE_ENV"] === "development") {
      if (!provided || provided !== AGENT_SECRET) {
        logger.warn(
          { path: req.path, label },
          "Agent-only route accessed without valid X-Agent-Secret — allowing in development mode",
        );
      }
      return next();
    }

    // Production: strictly enforce
    if (!AGENT_SECRET) {
      logger.error(
        "AGENT_SECRET env var is not set — agent-only routes are inaccessible. "
        + "Set AGENT_SECRET to the same value used in the agent's API_ADMIN_TOKEN.",
      );
      return next(
        new ForbiddenError(
          "Package management is disabled (agent secret not configured)",
        ),
      );
    }

    if (!provided || provided !== AGENT_SECRET) {
      logger.warn(
        { path: req.path, label, ip: req.ip },
        "Rejected agent-only request — invalid or missing X-Agent-Secret",
      );
      return next(
        new ForbiddenError(
          "This endpoint is restricted to the local management agent",
        ),
      );
    }

    next();
  };
}
