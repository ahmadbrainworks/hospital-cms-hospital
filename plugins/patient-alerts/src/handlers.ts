/**
 * Event handlers that react to hospital events and create alerts.
 */
import type { AlertService } from "./alert-service";
import type { PluginConfig } from "./types";

interface EncounterStatusPayload {
  encounterId: string;
  patientId: string;
  fromStatus: string;
  toStatus: string;
  timestamp: string;
}

interface LabResultPayload {
  labOrderId: string;
  patientId: string;
  encounterId?: string;
  testName: string;
  result: string;
  flag: "NORMAL" | "LOW" | "HIGH" | "CRITICAL";
  referenceRange: string;
  timestamp: string;
}

interface PatientUpdatedPayload {
  patientId: string;
  updatedFields: string[];
  allergies?: string[];
  currentMedications?: string[];
}

export function registerHandlers(
  alertService: AlertService,
  config: PluginConfig,
) {
  return {
    /**
     * When an encounter transitions to admitted status, check if
     * a full admission assessment has been documented.
     */
    "encounter.status.changed": async (payload: unknown) => {
      const { encounterId, patientId, toStatus } =
        payload as EncounterStatusPayload;

      if (toStatus === "ADMITTED") {
        // Flag that an admission assessment is due
        await alertService.createAlert(
          "overdue_assessment",
          "warning",
          patientId,
          "Admission assessment required within 24 hours",
          {
            encounterId,
            dueBy: new Date(
              Date.now() + config.overdueAssessmentHours * 60 * 60 * 1000,
            ).toISOString(),
          },
          encounterId,
        );
      }
    },

    /**
     * On lab results, create a critical alert if the flag is CRITICAL.
     */
    "lab.result.received": async (payload: unknown) => {
      const {
        labOrderId,
        patientId,
        encounterId,
        testName,
        result,
        flag,
        referenceRange,
      } = payload as LabResultPayload;

      if (flag === config.criticalLabThreshold) {
        await alertService.createAlert(
          "critical_lab",
          "critical",
          patientId,
          `Critical lab result: ${testName} = ${result} (ref: ${referenceRange})`,
          { labOrderId, testName, result, flag, referenceRange },
          encounterId,
        );
      }
    },

    /**
     * When a patient's allergy list changes, check for conflicts
     * with active medications (simplified demonstration).
     */
    "patient.updated": async (payload: unknown) => {
      if (!config.allergyCheckEnabled) return;

      const { patientId, updatedFields, allergies, currentMedications } =
        payload as PatientUpdatedPayload;

      if (!updatedFields.includes("allergies") || !allergies?.length) return;

      // Simple string-match conflict detection (real system would use a drug DB)
      const conflicts = (currentMedications ?? []).filter((med) =>
        allergies.some((allergy) =>
          med.toLowerCase().includes(allergy.toLowerCase()),
        ),
      );

      if (conflicts.length > 0) {
        await alertService.createAlert(
          "allergy_conflict",
          "critical",
          patientId,
          `Allergy-medication conflict detected: ${conflicts.join(", ")}`,
          { allergies, conflictingMedications: conflicts },
        );
      }
    },
  };
}
