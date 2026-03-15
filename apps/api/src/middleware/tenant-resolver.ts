/**
 * Tenant Resolver Middleware
 *
 * In single-tenant mode (current), this middleware is a no-op pass-through
 * that sets a default tenant context on res.locals.
 *
 * In future multi-tenant mode, it will resolve the tenant from:
 * - X-Tenant-Id header (API clients)
 * - Subdomain (web UI: hospital-a.cms.example.com)
 * - JWT claim (embedded tenantId in auth token)
 */
import type { Request, Response, NextFunction } from "express";
import { createTenantContext } from "@hospital-cms/database";

export function resolveTenant() {
  return (_req: Request, res: Response, next: NextFunction) => {
    // Single-tenant mode: use default context
    res.locals["tenant"] = createTenantContext("single");
    next();
  };
}
