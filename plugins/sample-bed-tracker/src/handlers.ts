/**
 * Event handlers — react to hospital-wide events.
 *
 * The plugin registry calls these when the event bus emits matching events.
 * Each handler receives an unknown payload and must cast it safely.
 */
import type { BedService } from "./bed-service";
import type { BedTrackerConfig } from "./types";

interface EncounterStatusPayload {
  encounterId: string;
  patientId: string;
  fromStatus: string;
  toStatus: string;
  wardId?: string;
}

interface PatientDischargedPayload {
  patientId: string;
  encounterId: string;
  dischargedAt: string;
}

export function registerHandlers(
  bedService: BedService,
  config: BedTrackerConfig,
) {
  return {
    /**
     * When a patient is admitted, auto-assign a bed in the target ward.
     */
    "encounter.status.changed": async (payload: unknown) => {
      const { encounterId, patientId, toStatus, wardId } =
        payload as EncounterStatusPayload;

      if (toStatus === "ADMITTED" && wardId) {
        const bed = await bedService.assignBed(wardId, patientId, encounterId);
        if (!bed) {
          // All beds occupied — the log warning is already emitted by BedService
        }
      }
    },

    /**
     * When a patient is discharged, release their bed(s).
     */
    "patient.discharged": async (payload: unknown) => {
      const { patientId } = payload as PatientDischargedPayload;
      const count = await bedService.releaseAllForPatient(patientId);
      if (count === 0) {
        // Patient had no bed assigned — that's fine
      }
    },
  };
}
