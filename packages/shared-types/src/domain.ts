// DOMAIN INTERFACES
// All domain types used across the system.

import type {
  AuditAction,
  BillingStatus,
  BloodGroup,
  CommandStatus,
  CommandType,
  EncounterStatus,
  EncounterType,
  Gender,
  LabOrderStatus,
  LicenseStatus,
  NetworkQuality,
  PatientStatus,
  PaymentMethod,
  Permission,
  PluginStatus,
  ThemeStatus,
  UserRole,
  WorkflowRunStatus,
} from "./enums";

//  Base
export interface BaseDocument {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftDeletable {
  deletedAt?: Date;
  deletedBy?: string;
}

//  User
export interface User extends BaseDocument, SoftDeletable {
  hospitalId: string;
  username: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
  isLocked: boolean;
  lockReason?: string;
  failedLoginAttempts: number;
  lastFailedLoginAt?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  mfaEnabled: boolean;
  mfaSecret?: string;
  passwordChangedAt: Date;
  mustChangePassword: boolean;
  profile: UserProfile;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  phone?: string;
  department?: string;
  specialization?: string;
  licenseNumber?: string;
  avatarUrl?: string;
}

export interface UserPublic extends Omit<
  User,
  "passwordHash" | "mfaSecret" | "failedLoginAttempts"
> {}

//  Hospital / Instance
export interface HospitalInstance extends BaseDocument {
  instanceId: string;
  name: string;
  slug: string;
  address: HospitalAddress;
  contact: HospitalContact;
  settings: HospitalSettings;
  publicKey: string;
  licenseId: string;
  isInstalled: boolean;
  installedAt?: Date;
  installedBy?: string;
  pairedAt?: Date;
  lastHeartbeatAt?: Date;
  agentVersion?: string;
  appVersion: string;
}

export interface HospitalAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface HospitalContact {
  email: string;
  phone: string;
  emergencyPhone?: string;
  website?: string;
}

export interface HospitalSettings {
  timezone: string;
  currency: string;
  dateFormat: string;
  defaultLanguage: string;
  appointmentDurationMinutes: number;
  enablePatientPortal: boolean;
}

//  Patient
export interface Patient extends BaseDocument, SoftDeletable {
  hospitalId: string;
  patientNumber: string;
  mrn: string; // Medical Record Number
  status: PatientStatus;
  profile: PatientProfile;
  contactInfo: PatientContact;
  emergencyContact?: EmergencyContact;
  insurance?: PatientInsurance[];
  medicalInfo: PatientMedicalInfo;
  registeredBy: string;
  assignedDoctor?: string;
}

export interface PatientProfile {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: Date;
  gender: Gender;
  nationalId?: string;
  passportNumber?: string;
  photoUrl?: string;
}

export interface PatientContact {
  phone: string;
  alternatePhone?: string;
  email?: string;
  address: PatientAddress;
}

export interface PatientAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  alternatePhone?: string;
}

export interface PatientInsurance {
  provider: string;
  policyNumber: string;
  groupNumber?: string;
  coverageType: string;
  expiryDate?: Date;
  isPrimary: boolean;
}

export interface PatientMedicalInfo {
  bloodGroup?: BloodGroup;
  allergies: string[];
  chronicConditions: string[];
  currentMedications: string[];
  notes?: string;
}

//  Encounter
export interface Encounter extends BaseDocument {
  hospitalId: string;
  patientId: string;
  encounterNumber: string;
  type: EncounterType;
  status: EncounterStatus;
  admittedAt: Date;
  dischargedAt?: Date;
  assignedDoctor?: string;
  assignedNurse?: string;
  ward?: string;
  bedNumber?: string;
  chiefComplaint: string;
  notes?: string;
  workflowRunId?: string;
  createdBy: string;
}

//  Billing
export interface Invoice extends BaseDocument {
  hospitalId: string;
  invoiceNumber: string;
  patientId: string;
  encounterId?: string;
  status: BillingStatus;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  notes?: string;
  issuedAt?: Date;
  dueDate?: Date;
  payments: Payment[];
  createdBy: string;
}

export interface InvoiceLineItem {
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  referenceId?: string;
  referenceType?: string;
}

export interface Payment {
  paymentId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paidAt: Date;
  receivedBy: string;
  notes?: string;
}

//  Lab
export interface LabOrder extends BaseDocument {
  hospitalId: string;
  patientId: string;
  encounterId: string;
  orderNumber: string;
  status: LabOrderStatus;
  orderedBy: string;
  orderedAt: Date;
  tests: LabTest[];
  priority: "ROUTINE" | "URGENT" | "STAT";
  sampleCollectedAt?: Date;
  sampleCollectedBy?: string;
  completedAt?: Date;
  notes?: string;
}

export interface LabTest {
  testCode: string;
  testName: string;
  result?: string;
  unit?: string;
  referenceRange?: string;
  isAbnormal?: boolean;
  resultNotes?: string;
  resultedAt?: Date;
  resultedBy?: string;
}

//  Pharmacy
export interface Prescription extends BaseDocument {
  hospitalId: string;
  patientId: string;
  encounterId: string;
  prescriptionNumber: string;
  prescribedBy: string;
  prescribedAt: Date;
  medications: PrescribedMedication[];
  dispensedAt?: Date;
  dispensedBy?: string;
  status: "PENDING" | "DISPENSED" | "CANCELLED";
  notes?: string;
}

export interface PrescribedMedication {
  medicationName: string;
  genericName?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions?: string;
  dispensedQuantity?: number;
}

//  Workflow
export interface WorkflowDefinition extends BaseDocument {
  hospitalId: string;
  name: string;
  version: number;
  description: string;
  steps: WorkflowStep[];
  initialStep: string;
  isActive: boolean;
  createdBy: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  transitions: WorkflowTransition[];
  requiredPermissions: Permission[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowTransition {
  id: string;
  label: string;
  targetStep: string;
  guards: WorkflowGuard[];
  requiredPermissions: Permission[];
  isTerminal: boolean;
}

export interface WorkflowGuard {
  type: "field_required" | "permission_check" | "custom";
  config: Record<string, unknown>;
}

export interface WorkflowRun extends BaseDocument {
  hospitalId: string;
  workflowId: string;
  entityType: string;
  entityId: string;
  status: WorkflowRunStatus;
  currentStep: string;
  history: WorkflowRunHistoryEntry[];
  metadata: Record<string, unknown>;
  startedAt: Date;
  completedAt?: Date;
  startedBy: string;
}

export interface WorkflowRunHistoryEntry {
  step: string;
  transitionId: string;
  transitionLabel: string;
  performedBy: string;
  performedAt: Date;
  notes?: string;
}

//  Plugin
export interface PluginManifest {
  pluginId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  vendorSigned: boolean;
  signature: string;
  publicKeyId: string;
  entryPoint: string;
  permissions: Permission[];
  routes: PluginRouteDefinition[];
  events: string[];
  uiSlots: PluginUiSlot[];
  minCoreVersion: string;
  maxCoreVersion?: string;
}

export interface PluginRouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  requiredPermission?: Permission;
  description: string;
}

export interface PluginUiSlot {
  slotId: string;
  component: string;
  props?: Record<string, unknown>;
}

export interface PluginRegistryEntry extends BaseDocument {
  hospitalId: string;
  pluginId: string;
  name: string;
  version: string;
  status: PluginStatus;
  manifest: PluginManifest;
  installedAt?: Date;
  installedBy?: string;
  activatedAt?: Date;
  lastError?: string;
  installPath?: string;
}

//  Theme
export interface ThemeManifest {
  themeId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  signature: string;
  publicKeyId: string;
  variables: ThemeVariable[];
  fonts?: ThemeFont[];
  logo?: string;
  favicon?: string;
}

export interface ThemeVariable {
  key: string;
  value: string;
  description?: string;
}

export interface ThemeFont {
  family: string;
  url: string;
  weights: number[];
}

export interface ThemeAssignment extends BaseDocument {
  hospitalId: string;
  themeId: string;
  manifest: ThemeManifest;
  status: ThemeStatus;
  assignedAt: Date;
  assignedBy: string;
}

//  Audit
export interface AuditLog extends BaseDocument {
  hospitalId: string;
  traceId: string;
  action: AuditAction;
  actor: AuditActor;
  resource: AuditResource;
  changes?: AuditChanges;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  outcome: "SUCCESS" | "FAILURE";
  failureReason?: string;
  metadata?: Record<string, unknown>;
  integrityHash: string;
  previousHash?: string;
}

export interface AuditActor {
  userId: string;
  username: string;
  role: UserRole;
  sessionId?: string;
}

export interface AuditResource {
  type: string;
  id?: string;
  name?: string;
}

export interface AuditChanges {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  fields: string[];
}

//  License
export interface License extends BaseDocument {
  licenseId: string;
  instanceId: string;
  hospitalId: string;
  status: LicenseStatus;
  /** Subscription tier: "community" | "professional" | "enterprise" */
  tier: string;
  features: string[];
  maxUsers: number;
  maxBeds: number;
  issuedAt: Date;
  expiresAt: Date;
  lastValidatedAt?: Date;
  signature: string;
  token: string;
}

//  Command
export interface OperationalCommand extends BaseDocument {
  commandId: string;
  instanceId: string;
  type: CommandType;
  payload: Record<string, unknown>;
  status: CommandStatus;
  issuedAt: Date;
  issuedBy: string;
  executedAt?: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
  signature: string;
  nonce: string;
  expiresAt: Date;
}

//  Network Advisory
export interface NetworkAdvisory extends BaseDocument {
  instanceId: string;
  quality: NetworkQuality;
  classification: string;
  signals: NetworkSignal[];
  score: number;
  generatedAt: Date;
  resolvedAt?: Date;
  isActive: boolean;
}

export interface NetworkSignal {
  type: string;
  value: number;
  unit: string;
  timestamp: Date;
}

//  API Contracts
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ApiMeta;
  traceId?: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  traceId?: string;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RequestContext {
  traceId: string;
  userId?: string;
  username?: string;
  role?: UserRole;
  permissions?: Permission[];
  sessionId?: string;
  hospitalId?: string;
  ipAddress?: string;
  userAgent?: string;
  startedAt: Date;
}
