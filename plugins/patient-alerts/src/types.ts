export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType = 'allergy_conflict' | 'critical_lab' | 'overdue_assessment' | 'fall_risk';

export interface PatientAlert {
  alertId: string;
  patientId: string;
  encounterId?: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PluginConfig {
  criticalLabThreshold: string;
  allergyCheckEnabled: boolean;
  overdueAssessmentHours: number;
}
