export {
  connectDatabase,
  disconnectDatabase,
  getDb,
  getClient,
} from "./client";
export { COLLECTIONS } from "./collections";
export { ensureIndexes } from "./indexes";
export { BaseRepository } from "./base-repository";
export type { WithStringId, FindManyOptions } from "./base-repository";
export { CounterService } from "./counter";

// Repositories
export { UserRepository } from "./repositories/user.repository";
export { PatientRepository } from "./repositories/patient.repository";
export { EncounterRepository } from "./repositories/encounter.repository";
export { InvoiceRepository } from "./repositories/invoice.repository";
export { AuditRepository } from "./repositories/audit.repository";
export { HospitalRepository } from "./repositories/hospital.repository";
export { LicenseRepository } from "./repositories/license.repository";
export { PluginRepository } from "./repositories/plugin.repository";
export { CommandRepository } from "./repositories/command.repository";
export { LicenseLeaseRepository } from "./repositories/license-lease.repository";

// Tenant context
export {
  createTenantContext,
  getDefaultTenantContext,
  resetDefaultTenantContext,
} from "./tenant-context";
export type { TenantContext, TenantMode } from "./tenant-context";
