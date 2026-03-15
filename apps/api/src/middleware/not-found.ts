import { Request, Response } from 'express';
import type { ApiError } from '@hospital-cms/shared-types';

export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiError = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    traceId: req.context?.traceId,
  };
  res.status(404).json(response);
}
