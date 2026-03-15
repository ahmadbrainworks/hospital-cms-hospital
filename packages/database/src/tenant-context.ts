/**
 * Tenant context abstraction for future multi-tenant readiness.
 *
 * In single-tenant mode (current), every request uses the same database.
 * In future multi-tenant mode, each tenant resolves to a separate or
 * prefixed database, enabling data isolation without code changes.
 *
 * This is a preparatory abstraction — it adds zero overhead in
 * single-tenant mode while making the codebase ready for multi-tenancy.
 */

export type TenantMode = "single" | "multi";

export interface TenantContext {
  tenantId: string;
  databaseName: string;
  mode: TenantMode;
}

/**
 * Create a tenant context.
 *
 * @param mode - "single" for current single-tenant deployments,
 *               "multi" for future shared-infrastructure deployments
 * @param tenantId - Required in multi-tenant mode. Ignored in single-tenant.
 * @param defaultDbName - Database name override (defaults to env or "hospital_cms")
 */
export function createTenantContext(
  mode: TenantMode = "single",
  tenantId?: string,
  defaultDbName?: string,
): TenantContext {
  if (mode === "single") {
    return {
      tenantId: "default",
      databaseName: defaultDbName ?? process.env["MONGODB_DB_NAME"] ?? "hospital_cms",
      mode,
    };
  }

  if (!tenantId) {
    throw new Error("tenantId is required in multi-tenant mode");
  }

  return {
    tenantId,
    databaseName: `hospital_cms_${tenantId}`,
    mode,
  };
}

/**
 * Default single-tenant context — used throughout the application
 * until multi-tenancy is enabled.
 */
let _defaultContext: TenantContext | null = null;

export function getDefaultTenantContext(): TenantContext {
  if (!_defaultContext) {
    _defaultContext = createTenantContext("single");
  }
  return _defaultContext;
}

export function resetDefaultTenantContext(): void {
  _defaultContext = null;
}
