import { Permission } from "@hospital-cms/shared-types";
import type { WorkflowDefinitionDef } from "../types";

// PATIENT ENCOUNTER WORKFLOW
// Registration → Triage → Doctor → Lab → Pharmacy → Billing → Discharge
//
// Each step defines what transitions are possible and what
// permissions + guards are required before the transition fires.

export const PATIENT_ENCOUNTER_WORKFLOW: WorkflowDefinitionDef = {
  name: "patient_encounter",
  version: 1,
  description: "Standard outpatient/inpatient encounter lifecycle",
  initialStep: "registered",
  steps: [
    //  REGISTERED
    {
      id: "registered",
      name: "Registered",
      description: "Patient has been registered at reception",
      requiredPermissions: [Permission.ENCOUNTER_READ],
      transitions: [
        {
          id: "send_to_triage",
          label: "Send to Triage",
          targetStep: "triage",
          isTerminal: false,
          requiredPermissions: [Permission.ENCOUNTER_UPDATE],
          guards: [],
        },
        {
          id: "cancel_encounter",
          label: "Cancel",
          targetStep: "cancelled",
          isTerminal: true,
          requiredPermissions: [Permission.ENCOUNTER_CLOSE],
          guards: [],
        },
      ],
    },

    //  TRIAGE
    {
      id: "triage",
      name: "Triage",
      description: "Nurse assesses patient urgency",
      requiredPermissions: [Permission.ENCOUNTER_READ],
      transitions: [
        {
          id: "triage_to_waiting",
          label: "Waiting for Doctor",
          targetStep: "waiting_for_doctor",
          isTerminal: false,
          requiredPermissions: [Permission.ENCOUNTER_UPDATE],
          guards: [
            {
              type: "field_required",
              config: {
                field: "assignedDoctor",
                message: "A doctor must be assigned before sending to waiting.",
              },
            },
          ],
        },
        {
          id: "triage_to_emergency",
          label: "Emergency — Admit Immediately",
          targetStep: "with_doctor",
          isTerminal: false,
          requiredPermissions: [Permission.ENCOUNTER_UPDATE],
          guards: [],
        },
      ],
    },

    //  WAITING FOR DOCTOR
    {
      id: "waiting_for_doctor",
      name: "Waiting",
      description: "Patient is waiting to be seen by the assigned doctor",
      requiredPermissions: [Permission.ENCOUNTER_READ],
      transitions: [
        {
          id: "doctor_sees_patient",
          label: "Doctor Sees Patient",
          targetStep: "with_doctor",
          isTerminal: false,
          requiredPermissions: [Permission.ENCOUNTER_UPDATE],
          guards: [],
        },
      ],
    },

    //  WITH DOCTOR
    {
      id: "with_doctor",
      name: "With Doctor",
      description: "Patient is being examined by the doctor",
      requiredPermissions: [Permission.ENCOUNTER_READ],
      transitions: [
        {
          id: "order_labs",
          label: "Order Lab Tests",
          targetStep: "pending_lab",
          isTerminal: false,
          requiredPermissions: [Permission.LAB_ORDER_CREATE],
          guards: [],
        },
        {
          id: "prescribe_medications",
          label: "Prescribe & Send to Pharmacy",
          targetStep: "pending_pharmacy",
          isTerminal: false,
          requiredPermissions: [Permission.PHARMACY_PRESCRIBE],
          guards: [],
        },
        {
          id: "doctor_to_billing",
          label: "Send to Billing",
          targetStep: "billing",
          isTerminal: false,
          requiredPermissions: [Permission.ENCOUNTER_UPDATE],
          guards: [],
        },
        {
          id: "admit_patient",
          label: "Admit (IPD)",
          targetStep: "admitted",
          isTerminal: false,
          requiredPermissions: [Permission.ENCOUNTER_UPDATE],
          guards: [
            {
              type: "field_required",
              config: {
                field: "ward",
                message: "Ward must be assigned before admission.",
              },
            },
          ],
        },
      ],
    },

    //  PENDING LAB
    {
      id: "pending_lab",
      name: "Pending Lab",
      description: "Awaiting lab results",
      requiredPermissions: [Permission.ENCOUNTER_READ],
      transitions: [
        {
          id: "lab_results_ready",
          label: "Lab Results Ready — Return to Doctor",
          targetStep: "with_doctor",
          isTerminal: false,
          requiredPermissions: [Permission.LAB_RESULT_WRITE],
          guards: [],
        },
      ],
    },

    //  PENDING PHARMACY
    {
      id: "pending_pharmacy",
      name: "Pending Pharmacy",
      description: "Awaiting pharmacy dispensing",
      requiredPermissions: [Permission.ENCOUNTER_READ],
      transitions: [
        {
          id: "medications_dispensed",
          label: "Medications Dispensed",
          targetStep: "billing",
          isTerminal: false,
          requiredPermissions: [Permission.PHARMACY_DISPENSE],
          guards: [],
        },
      ],
    },

    //  ADMITTED (IPD)
    {
      id: "admitted",
      name: "Admitted (IPD)",
      description: "Patient is admitted as inpatient",
      requiredPermissions: [Permission.ENCOUNTER_READ],
      transitions: [
        {
          id: "ipd_to_billing",
          label: "Ready for Discharge — Send to Billing",
          targetStep: "billing",
          isTerminal: false,
          requiredPermissions: [Permission.ENCOUNTER_UPDATE],
          guards: [],
        },
      ],
    },

    //  BILLING
    {
      id: "billing",
      name: "Billing",
      description: "Billing and payment processing",
      requiredPermissions: [Permission.ENCOUNTER_READ],
      transitions: [
        {
          id: "payment_complete_discharge",
          label: "Payment Complete — Discharge",
          targetStep: "discharged",
          isTerminal: true,
          requiredPermissions: [Permission.BILLING_UPDATE],
          guards: [],
        },
        {
          id: "waive_and_discharge",
          label: "Waive & Discharge",
          targetStep: "discharged",
          isTerminal: true,
          requiredPermissions: [Permission.BILLING_VOID],
          guards: [],
        },
      ],
    },

    //  DISCHARGED (terminal)
    {
      id: "discharged",
      name: "Discharged",
      description: "Patient has been discharged",
      requiredPermissions: [Permission.ENCOUNTER_READ],
      transitions: [],
    },

    //  CANCELLED (terminal)
    {
      id: "cancelled",
      name: "Cancelled",
      description: "Encounter was cancelled",
      requiredPermissions: [Permission.ENCOUNTER_READ],
      transitions: [],
    },
  ],
};
