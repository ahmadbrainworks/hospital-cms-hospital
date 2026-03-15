import { UserRole, Permission } from "@hospital-cms/shared-types";

// ROLE → PERMISSION MAPPING
// These are the default grants per role.
// Additional per-user permissions can be stored on the User doc.
// SUPER_ADMIN has all permissions and bypasses checks.

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: Object.values(Permission),

  [UserRole.HOSPITAL_ADMIN]: [
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,
    Permission.USER_MANAGE_ROLES,
    Permission.PATIENT_CREATE,
    Permission.PATIENT_READ,
    Permission.PATIENT_UPDATE,
    Permission.PATIENT_DELETE,
    Permission.PATIENT_READ_SENSITIVE,
    Permission.ENCOUNTER_CREATE,
    Permission.ENCOUNTER_READ,
    Permission.ENCOUNTER_UPDATE,
    Permission.ENCOUNTER_CLOSE,
    Permission.BILLING_CREATE,
    Permission.BILLING_READ,
    Permission.BILLING_UPDATE,
    Permission.BILLING_VOID,
    Permission.BILLING_REFUND,
    Permission.LAB_ORDER_CREATE,
    Permission.LAB_ORDER_READ,
    Permission.LAB_RESULT_WRITE,
    Permission.LAB_RESULT_READ,
    Permission.PHARMACY_PRESCRIBE,
    Permission.PHARMACY_DISPENSE,
    Permission.PHARMACY_INVENTORY_READ,
    Permission.PHARMACY_INVENTORY_MANAGE,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_TRANSITION,
    Permission.WORKFLOW_ADMIN,
    Permission.AUDIT_READ,
    Permission.AUDIT_EXPORT,
    Permission.SYSTEM_SETTINGS_READ,
    Permission.SYSTEM_SETTINGS_WRITE,
    Permission.SYSTEM_PLUGINS_MANAGE,
    Permission.SYSTEM_THEMES_MANAGE,
    Permission.SYSTEM_DIAGNOSTICS,
    Permission.REPORT_GENERATE,
  ],

  [UserRole.DOCTOR]: [
    Permission.PATIENT_READ,
    Permission.PATIENT_UPDATE,
    Permission.PATIENT_READ_SENSITIVE,
    Permission.ENCOUNTER_CREATE,
    Permission.ENCOUNTER_READ,
    Permission.ENCOUNTER_UPDATE,
    Permission.LAB_ORDER_CREATE,
    Permission.LAB_ORDER_READ,
    Permission.LAB_RESULT_READ,
    Permission.PHARMACY_PRESCRIBE,
    Permission.PHARMACY_INVENTORY_READ,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_TRANSITION,
    Permission.BILLING_READ,
  ],

  [UserRole.NURSE]: [
    Permission.PATIENT_READ,
    Permission.PATIENT_UPDATE,
    Permission.ENCOUNTER_READ,
    Permission.ENCOUNTER_UPDATE,
    Permission.LAB_ORDER_READ,
    Permission.LAB_RESULT_READ,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_TRANSITION,
    Permission.BILLING_READ,
  ],

  [UserRole.RECEPTIONIST]: [
    Permission.PATIENT_CREATE,
    Permission.PATIENT_READ,
    Permission.PATIENT_UPDATE,
    Permission.ENCOUNTER_CREATE,
    Permission.ENCOUNTER_READ,
    Permission.BILLING_READ,
    Permission.BILLING_CREATE,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_TRANSITION,
  ],

  [UserRole.PHARMACIST]: [
    Permission.PATIENT_READ,
    Permission.PHARMACY_DISPENSE,
    Permission.PHARMACY_INVENTORY_READ,
    Permission.PHARMACY_INVENTORY_MANAGE,
    Permission.ENCOUNTER_READ,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_TRANSITION,
  ],

  [UserRole.LAB_TECHNICIAN]: [
    Permission.PATIENT_READ,
    Permission.LAB_ORDER_READ,
    Permission.LAB_RESULT_WRITE,
    Permission.LAB_RESULT_READ,
    Permission.ENCOUNTER_READ,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_TRANSITION,
  ],

  [UserRole.BILLING_STAFF]: [
    Permission.PATIENT_READ,
    Permission.ENCOUNTER_READ,
    Permission.BILLING_CREATE,
    Permission.BILLING_READ,
    Permission.BILLING_UPDATE,
    Permission.BILLING_VOID,
    Permission.BILLING_REFUND,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_TRANSITION,
  ],

  [UserRole.AUDITOR]: [
    Permission.PATIENT_READ,
    Permission.ENCOUNTER_READ,
    Permission.BILLING_READ,
    Permission.AUDIT_READ,
    Permission.AUDIT_EXPORT,
    Permission.WORKFLOW_READ,
    Permission.SYSTEM_SETTINGS_READ,
  ],

  [UserRole.READONLY]: [
    Permission.PATIENT_READ,
    Permission.ENCOUNTER_READ,
    Permission.BILLING_READ,
    Permission.WORKFLOW_READ,
  ],
};

export function getDefaultPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
