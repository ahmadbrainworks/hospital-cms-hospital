// DOMAIN ENUMERATIONS

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  HOSPITAL_ADMIN = "HOSPITAL_ADMIN",
  DOCTOR = "DOCTOR",
  NURSE = "NURSE",
  RECEPTIONIST = "RECEPTIONIST",
  PHARMACIST = "PHARMACIST",
  LAB_TECHNICIAN = "LAB_TECHNICIAN",
  BILLING_STAFF = "BILLING_STAFF",
  AUDITOR = "AUDITOR",
  READONLY = "READONLY",
}

export enum Permission {
  // User management
  USER_CREATE = "user:create",
  USER_READ = "user:read",
  USER_UPDATE = "user:update",
  USER_DELETE = "user:delete",
  USER_MANAGE_ROLES = "user:manage_roles",

  // Patient management
  PATIENT_CREATE = "patient:create",
  PATIENT_READ = "patient:read",
  PATIENT_UPDATE = "patient:update",
  PATIENT_DELETE = "patient:delete",
  PATIENT_READ_SENSITIVE = "patient:read_sensitive",

  // Encounter management
  ENCOUNTER_CREATE = "encounter:create",
  ENCOUNTER_READ = "encounter:read",
  ENCOUNTER_UPDATE = "encounter:update",
  ENCOUNTER_CLOSE = "encounter:close",

  // Billing
  BILLING_CREATE = "billing:create",
  BILLING_READ = "billing:read",
  BILLING_UPDATE = "billing:update",
  BILLING_VOID = "billing:void",
  BILLING_REFUND = "billing:refund",

  // Lab
  LAB_ORDER_CREATE = "lab:order:create",
  LAB_ORDER_READ = "lab:order:read",
  LAB_RESULT_WRITE = "lab:result:write",
  LAB_RESULT_READ = "lab:result:read",

  // Pharmacy
  PHARMACY_PRESCRIBE = "pharmacy:prescribe",
  PHARMACY_DISPENSE = "pharmacy:dispense",
  PHARMACY_INVENTORY_READ = "pharmacy:inventory:read",
  PHARMACY_INVENTORY_MANAGE = "pharmacy:inventory:manage",

  // Workflow
  WORKFLOW_READ = "workflow:read",
  WORKFLOW_TRANSITION = "workflow:transition",
  WORKFLOW_ADMIN = "workflow:admin",

  // Audit
  AUDIT_READ = "audit:read",
  AUDIT_EXPORT = "audit:export",

  // System
  SYSTEM_SETTINGS_READ = "system:settings:read",
  SYSTEM_SETTINGS_WRITE = "system:settings:write",
  SYSTEM_PLUGINS_MANAGE = "system:plugins:manage",
  SYSTEM_THEMES_MANAGE = "system:themes:manage",
  SYSTEM_KEYS_ROTATE = "system:keys:rotate",
  SYSTEM_DIAGNOSTICS = "system:diagnostics",

  // Reports
  REPORT_GENERATE = "report:generate",
}

export enum PatientStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  DECEASED = "DECEASED",
  TRANSFERRED = "TRANSFERRED",
}

export enum EncounterType {
  OPD = "OPD",
  IPD = "IPD",
  EMERGENCY = "EMERGENCY",
}

export enum EncounterStatus {
  REGISTERED = "REGISTERED",
  TRIAGE = "TRIAGE",
  WAITING = "WAITING",
  WITH_DOCTOR = "WITH_DOCTOR",
  PENDING_LAB = "PENDING_LAB",
  PENDING_PHARMACY = "PENDING_PHARMACY",
  BILLING = "BILLING",
  DISCHARGED = "DISCHARGED",
  CANCELLED = "CANCELLED",
}

export enum BillingStatus {
  DRAFT = "DRAFT",
  ISSUED = "ISSUED",
  PARTIAL = "PARTIAL",
  PAID = "PAID",
  VOID = "VOID",
  REFUNDED = "REFUNDED",
}

export enum PaymentMethod {
  CASH = "CASH",
  CARD = "CARD",
  INSURANCE = "INSURANCE",
  BANK_TRANSFER = "BANK_TRANSFER",
  MOBILE_MONEY = "MOBILE_MONEY",
}

export enum LabOrderStatus {
  ORDERED = "ORDERED",
  SAMPLE_COLLECTED = "SAMPLE_COLLECTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum PluginStatus {
  INSTALLED = "INSTALLED",
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
  FAILED = "FAILED",
  UPDATING = "UPDATING",
  REMOVING = "REMOVING",
}

export enum ThemeStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export enum WorkflowRunStatus {
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum CommandStatus {
  PENDING = "PENDING",
  EXECUTING = "EXECUTING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REJECTED = "REJECTED",
}

export enum CommandType {
  RESTART_SERVICE = "RESTART_SERVICE",
  APPLY_CONFIG = "APPLY_CONFIG",
  INSTALL_PLUGIN = "INSTALL_PLUGIN",
  UPDATE_PLUGIN = "UPDATE_PLUGIN",
  ROLLBACK_PLUGIN = "ROLLBACK_PLUGIN",
  REMOVE_PLUGIN = "REMOVE_PLUGIN",
  ACTIVATE_THEME = "ACTIVATE_THEME",
  ROTATE_KEYS = "ROTATE_KEYS",
  EXPORT_DIAGNOSTICS = "EXPORT_DIAGNOSTICS",
}

export enum LicenseStatus {
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  SUSPENDED = "SUSPENDED",
  TRIAL = "TRIAL",
}

export enum NetworkQuality {
  GOOD = "GOOD",
  DEGRADED = "DEGRADED",
  POOR = "POOR",
  OFFLINE = "OFFLINE",
}

export enum AuditAction {
  // Auth
  AUTH_LOGIN = "auth.login",
  AUTH_LOGOUT = "auth.logout",
  AUTH_LOGIN_FAILED = "auth.login_failed",
  AUTH_PASSWORD_CHANGED = "auth.password_changed",
  AUTH_KEYS_ROTATED = "auth.keys_rotated",

  // User
  USER_CREATED = "user.created",
  USER_UPDATED = "user.updated",
  USER_DELETED = "user.deleted",
  USER_ROLE_CHANGED = "user.role_changed",
  USER_LOCKED = "user.locked",
  USER_UNLOCKED = "user.unlocked",

  // Patient
  PATIENT_CREATED = "patient.created",
  PATIENT_UPDATED = "patient.updated",
  PATIENT_DELETED = "patient.deleted",
  PATIENT_RECORD_ACCESSED = "patient.record_accessed",
  PATIENT_SENSITIVE_ACCESSED = "patient.sensitive_accessed",

  // Encounter
  ENCOUNTER_CREATED = "encounter.created",
  ENCOUNTER_UPDATED = "encounter.updated",
  ENCOUNTER_STATUS_CHANGED = "encounter.status_changed",
  ENCOUNTER_DISCHARGED = "encounter.discharged",

  // Billing
  BILLING_INVOICE_CREATED = "billing.invoice_created",
  BILLING_PAYMENT_RECORDED = "billing.payment_recorded",
  BILLING_INVOICE_VOIDED = "billing.invoice_voided",
  BILLING_REFUND_ISSUED = "billing.refund_issued",

  // Plugin
  PLUGIN_INSTALLED = "plugin.installed",
  PLUGIN_ACTIVATED = "plugin.activated",
  PLUGIN_DEACTIVATED = "plugin.deactivated",
  PLUGIN_REMOVED = "plugin.removed",
  PLUGIN_FAILED = "plugin.failed",

  // Workflow
  WORKFLOW_STARTED = "workflow.started",
  WORKFLOW_TRANSITION = "workflow.transition",
  WORKFLOW_COMPLETED = "workflow.completed",
  WORKFLOW_FAILED = "workflow.failed",

  // Command
  COMMAND_RECEIVED = "command.received",
  COMMAND_EXECUTED = "command.executed",
  COMMAND_FAILED = "command.failed",
  COMMAND_REJECTED = "command.rejected",

  // System
  SYSTEM_INSTALL_COMPLETED = "system.install_completed",
  SYSTEM_LICENSE_UPDATED = "system.license_updated",
  SYSTEM_CONFIG_CHANGED = "system.config_changed",
}

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
  PREFER_NOT_TO_SAY = "PREFER_NOT_TO_SAY",
}

export enum BloodGroup {
  A_POS = "A+",
  A_NEG = "A-",
  B_POS = "B+",
  B_NEG = "B-",
  O_POS = "O+",
  O_NEG = "O-",
  AB_POS = "AB+",
  AB_NEG = "AB-",
  UNKNOWN = "UNKNOWN",
}
