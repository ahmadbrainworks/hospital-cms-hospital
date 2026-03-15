import { Response } from "express";
import type {
  ApiResponse,
  ApiMeta,
  PaginatedResult,
} from "@hospital-cms/shared-types";

// RESPONSE HELPERS
// Enforce consistent response shape across all controllers.

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: ApiMeta,
  traceId?: string,
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(meta && { meta }),
    ...(traceId && { traceId }),
  };
  res.status(statusCode).json(response);
}

export function sendPaginated<T>(
  res: Response,
  result: PaginatedResult<T>,
  traceId?: string,
): void {
  sendSuccess(
    res,
    result.items,
    200,
    {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    traceId,
  );
}

export function sendCreated<T>(res: Response, data: T, traceId?: string): void {
  sendSuccess(res, data, 201, undefined, traceId);
}

export function sendNoContent(res: Response): void {
  res.status(204).send();
}
