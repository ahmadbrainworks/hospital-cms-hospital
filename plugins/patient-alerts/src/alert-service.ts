import { randomUUID } from "node:crypto";
import type { PluginApi as PluginSandbox } from "@hospital-cms/plugin-runtime";
import type {
  PatientAlert,
  AlertSeverity,
  AlertType,
  PluginConfig,
} from "./types";

const STORAGE_KEY = "alerts";

export class AlertService {
  constructor(
    private readonly sandbox: PluginSandbox,
    private readonly config: PluginConfig,
  ) {}

  async createAlert(
    type: AlertType,
    severity: AlertSeverity,
    patientId: string,
    message: string,
    details: Record<string, unknown>,
    encounterId?: string,
  ): Promise<PatientAlert> {
    const alert: PatientAlert = {
      alertId: randomUUID(),
      patientId,
      encounterId,
      type,
      severity,
      message,
      details,
      acknowledgedAt: null,
      acknowledgedBy: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };

    // Persist via sandbox scoped storage (isolated to this plugin + hospital)
    const existing = await this.loadAlerts();
    existing.push(alert);
    await this.sandbox.storage.set(STORAGE_KEY, JSON.stringify(existing));

    this.sandbox.log.info(`Alert created: ${alert.alertId} type=${type} severity=${severity} patient=${patientId}`);
    return alert;
  }

  async getAlertsForPatient(patientId: string): Promise<PatientAlert[]> {
    const all = await this.loadAlerts();
    return all.filter((a) => a.patientId === patientId && !a.resolvedAt);
  }

  async getActiveAlerts(hospitalId?: string): Promise<PatientAlert[]> {
    const all = await this.loadAlerts();
    return all.filter((a) => !a.resolvedAt);
  }

  async acknowledge(
    alertId: string,
    userId: string,
  ): Promise<PatientAlert | null> {
    const all = await this.loadAlerts();
    const idx = all.findIndex((a) => a.alertId === alertId);
    if (idx < 0) return null;

    all[idx]!.acknowledgedAt = new Date().toISOString();
    all[idx]!.acknowledgedBy = userId;
    await this.sandbox.storage.set(STORAGE_KEY, JSON.stringify(all));
    return all[idx]!;
  }

  async resolve(alertId: string): Promise<void> {
    const all = await this.loadAlerts();
    const idx = all.findIndex((a) => a.alertId === alertId);
    if (idx < 0) return;

    all[idx]!.resolvedAt = new Date().toISOString();
    await this.sandbox.storage.set(STORAGE_KEY, JSON.stringify(all));

    this.sandbox.log.info(`Alert resolved: ${alertId}`);
  }

  private async loadAlerts(): Promise<PatientAlert[]> {
    const raw = await this.sandbox.storage.get(STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(String(raw)) as PatientAlert[];
    } catch {
      return [];
    }
  }
}
