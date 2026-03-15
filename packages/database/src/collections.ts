// COLLECTION NAMES — single source of truth

export const COLLECTIONS = {
  USERS: "users",
  HOSPITAL_INSTANCE: "hospital_instance",
  PATIENTS: "patients",
  ENCOUNTERS: "encounters",
  INVOICES: "invoices",
  LAB_ORDERS: "lab_orders",
  PRESCRIPTIONS: "prescriptions",
  WORKFLOW_DEFINITIONS: "workflow_definitions",
  WORKFLOW_RUNS: "workflow_runs",
  PLUGIN_REGISTRY: "plugin_registry",
  THEME_ASSIGNMENTS: "theme_assignments",
  AUDIT_LOGS: "audit_logs",
  LICENSES: "licenses",
  OPERATIONAL_COMMANDS: "operational_commands",
  NETWORK_ADVISORIES: "network_advisories",
  SESSIONS: "sessions",
  COUNTER_SEQUENCES: "counter_sequences",
  LICENSE_LEASES: "license_leases",
  INSTALLED_PACKAGES: "installed_packages",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
