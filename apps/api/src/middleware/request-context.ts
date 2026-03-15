import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import type { RequestContext } from "@hospital-cms/shared-types";

// REQUEST CONTEXT MIDDLEWARE
// Attaches a traceId and request metadata to every request.
// This propagates through all services for structured logging.

export function requestContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const traceId = (req.headers["x-trace-id"] as string | undefined) ?? uuidv4();

  const ipAddress =
    (req.headers["x-forwarded-for"] as string | undefined)
      ?.split(",")[0]
      ?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  req.context = {
    traceId,
    ipAddress,
    userAgent: req.headers["user-agent"],
    startedAt: new Date(),
  } satisfies RequestContext;

  next();
}
