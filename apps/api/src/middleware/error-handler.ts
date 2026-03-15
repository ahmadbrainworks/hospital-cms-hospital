import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "@hospital-cms/logger";
import { isAppError, ValidationError } from "@hospital-cms/errors";
import type { ApiError } from "@hospital-cms/shared-types";

// CENTRALIZED ERROR HANDLER
// All errors bubble to here. Operational errors return structured
// API responses. Unexpected errors return 500 with no internals.

const log = logger("api:error-handler");

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const traceId = req.context?.traceId ?? "unknown";

  // Zod validation errors — convert to ValidationError shape
  if (err instanceof ZodError) {
    const details = err.errors.reduce<Record<string, string>>((acc, issue) => {
      const path = issue.path.join(".");
      acc[path] = issue.message;
      return acc;
    }, {});

    const response: ApiError = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details,
      },
      traceId,
    };

    res.status(400).json(response);
    return;
  }

  // Known operational AppErrors
  if (isAppError(err)) {
    if (!err.isOperational) {
      log.error(
        { err, traceId, path: req.path, method: req.method },
        "Non-operational error",
      );
    } else {
      log.warn(
        { code: err.code, message: err.message, traceId },
        "Operational error",
      );
    }

    const response: ApiError = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
      traceId,
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Unknown / unexpected errors
  log.error(
    { err, traceId, path: req.path, method: req.method },
    "Unexpected error",
  );

  const response: ApiError = {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    },
    traceId,
  };

  res.status(500).json(response);
}
