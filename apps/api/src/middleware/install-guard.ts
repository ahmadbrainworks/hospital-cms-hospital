import { Request, Response, NextFunction } from "express";
import type { HospitalRepository } from "@hospital-cms/database";
import type { ApiError } from "@hospital-cms/shared-types";

// INSTALL GUARD
// Blocks all API routes if the system hasn't been installed yet.
// The installer creates the hospital instance doc + lock file.

let installationState: boolean | null = null;

export function installGuard(hospitalRepo: HospitalRepository) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Cache the state — don't hit DB on every request
    if (installationState === null) {
      installationState = await hospitalRepo.isInstalled();
    }

    if (!installationState) {
      const response: ApiError = {
        success: false,
        error: {
          code: "NOT_INSTALLED",
          message:
            "This instance has not been configured. Please complete the installation at /install",
        },
        traceId: req.context?.traceId,
      };
      res.status(503).json(response);
      return;
    }

    next();
  };
}

// Called by installer finalization to bust the cache
export function markAsInstalled(): void {
  installationState = true;
}
