import { Db } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "@hospital-cms/logger";
import { CP_COLLECTIONS } from "../db";

const logger = createLogger({ module: "AlertEngine" });

// ─── Types ──────────────────────────────────────────────────────────

export type AlertCondition =
  | { type: "metric_threshold"; metric: string; operator: "gt" | "lt" | "gte" | "lte"; value: number }
  | { type: "heartbeat_missing"; minutes: number }
  | { type: "package_failed"; consecutiveFailures: number }
  | { type: "license_expiry_approaching"; daysRemaining: number };

export interface AlertRule {
  ruleId: string;
  name: string;
  enabled: boolean;
  instanceFilter: string[] | "*";
  condition: AlertCondition;
  durationMinutes: number;
  severity: "critical" | "warning" | "info";
  cooldownMinutes: number;
  createdBy: string;
  createdAt: string;
}

export interface Alert {
  alertId: string;
  ruleId: string;
  instanceId: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  status: "firing" | "acknowledged" | "resolved";
  firedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  lastEvaluatedAt: string;
}

// ─── Default Rules ──────────────────────────────────────────────────

const DEFAULT_RULES: Omit<AlertRule, "createdAt">[] = [
  { ruleId: "instance_offline_critical", name: "Instance Offline (Critical)", enabled: true, instanceFilter: "*", condition: { type: "heartbeat_missing", minutes: 15 }, durationMinutes: 0, severity: "critical", cooldownMinutes: 60, createdBy: "system" },
  { ruleId: "instance_offline_warning", name: "Instance Offline (Warning)", enabled: true, instanceFilter: "*", condition: { type: "heartbeat_missing", minutes: 5 }, durationMinutes: 0, severity: "warning", cooldownMinutes: 30, createdBy: "system" },
  { ruleId: "cpu_high", name: "High CPU Usage", enabled: true, instanceFilter: "*", condition: { type: "metric_threshold", metric: "cpuPercent", operator: "gt", value: 90 }, durationMinutes: 5, severity: "warning", cooldownMinutes: 15, createdBy: "system" },
  { ruleId: "disk_critical", name: "Disk Space Critical", enabled: true, instanceFilter: "*", condition: { type: "metric_threshold", metric: "diskPercent", operator: "gt", value: 95 }, durationMinutes: 0, severity: "critical", cooldownMinutes: 60, createdBy: "system" },
  { ruleId: "disk_warning", name: "Disk Space Warning", enabled: true, instanceFilter: "*", condition: { type: "metric_threshold", metric: "diskPercent", operator: "gt", value: 85 }, durationMinutes: 0, severity: "warning", cooldownMinutes: 60, createdBy: "system" },
  { ruleId: "memory_high", name: "High Memory Usage", enabled: true, instanceFilter: "*", condition: { type: "metric_threshold", metric: "memoryPercent", operator: "gt", value: 90 }, durationMinutes: 5, severity: "warning", cooldownMinutes: 15, createdBy: "system" },
  { ruleId: "license_expiring", name: "License Expiring Soon", enabled: true, instanceFilter: "*", condition: { type: "license_expiry_approaching", daysRemaining: 14 }, durationMinutes: 0, severity: "warning", cooldownMinutes: 1440, createdBy: "system" },
  { ruleId: "license_expiring_critical", name: "License Expiring (Critical)", enabled: true, instanceFilter: "*", condition: { type: "license_expiry_approaching", daysRemaining: 3 }, durationMinutes: 0, severity: "critical", cooldownMinutes: 720, createdBy: "system" },
  { ruleId: "package_deploy_failed", name: "Package Deploy Failed", enabled: true, instanceFilter: "*", condition: { type: "package_failed", consecutiveFailures: 3 }, durationMinutes: 0, severity: "warning", cooldownMinutes: 60, createdBy: "system" },
];

// ─── Service ────────────────────────────────────────────────────────

export class AlertEngineService {
  constructor(private readonly db: Db) {}

  private rulesCol() {
    return this.db.collection(CP_COLLECTIONS.ALERT_RULES);
  }

  private alertsCol() {
    return this.db.collection(CP_COLLECTIONS.ALERTS);
  }

  /** Seed default alert rules if none exist. */
  async seedDefaults(): Promise<void> {
    const count = await this.rulesCol().countDocuments();
    if (count > 0) return;

    const now = new Date().toISOString();
    const docs = DEFAULT_RULES.map((r) => ({ ...r, createdAt: now }));
    await this.rulesCol().insertMany(docs);
    logger.info({ count: docs.length }, "Seeded default alert rules");
  }

  /** Evaluate all enabled rules against all matching instances. */
  async evaluate(): Promise<void> {
    const rules = await this.rulesCol().find({ enabled: true }).toArray();
    const instances = await this.db
      .collection(CP_COLLECTIONS.INSTANCES)
      .find({})
      .toArray();

    for (const rule of rules) {
      const matchingInstances = rule["instanceFilter"] === "*"
        ? instances
        : instances.filter((inst) =>
            (rule["instanceFilter"] as string[]).includes(inst["instanceId"] as string),
          );

      for (const instance of matchingInstances) {
        try {
          await this.evaluateRuleForInstance(rule as unknown as AlertRule, instance);
        } catch (err) {
          logger.error(
            { err, ruleId: rule["ruleId"], instanceId: instance["instanceId"] },
            "Alert rule evaluation failed",
          );
        }
      }
    }
  }

  private async evaluateRuleForInstance(
    rule: AlertRule,
    instance: Record<string, unknown>,
  ): Promise<void> {
    const instanceId = instance["instanceId"] as string;
    const conditionMet = await this.checkCondition(rule.condition, instance);

    const existingAlert = await this.alertsCol().findOne({
      ruleId: rule.ruleId,
      instanceId,
      status: { $in: ["firing", "acknowledged"] },
    });

    if (conditionMet) {
      if (existingAlert) {
        // Update lastEvaluatedAt
        await this.alertsCol().updateOne(
          { alertId: existingAlert["alertId"] },
          { $set: { lastEvaluatedAt: new Date().toISOString() } },
        );
        return;
      }

      // Check cooldown
      const lastResolved = await this.alertsCol().findOne(
        { ruleId: rule.ruleId, instanceId, status: "resolved" },
        { sort: { resolvedAt: -1 } },
      );
      if (lastResolved) {
        const resolved = new Date(lastResolved["resolvedAt"] as string).getTime();
        if (Date.now() - resolved < rule.cooldownMinutes * 60_000) return;
      }

      // Fire alert
      const alert: Alert = {
        alertId: uuidv4(),
        ruleId: rule.ruleId,
        instanceId,
        severity: rule.severity,
        title: rule.name,
        detail: this.buildAlertDetail(rule.condition, instance),
        status: "firing",
        firedAt: new Date().toISOString(),
        lastEvaluatedAt: new Date().toISOString(),
      };
      await this.alertsCol().insertOne(alert as any);
      logger.warn(
        { alertId: alert.alertId, ruleId: rule.ruleId, instanceId, severity: rule.severity },
        `Alert fired: ${rule.name}`,
      );
    } else if (existingAlert) {
      // Auto-resolve
      await this.alertsCol().updateOne(
        { alertId: existingAlert["alertId"] },
        {
          $set: {
            status: "resolved",
            resolvedAt: new Date().toISOString(),
            lastEvaluatedAt: new Date().toISOString(),
          },
        },
      );
      logger.info(
        { alertId: existingAlert["alertId"], ruleId: rule.ruleId, instanceId },
        "Alert auto-resolved",
      );
    }
  }

  private async checkCondition(
    condition: AlertCondition,
    instance: Record<string, unknown>,
  ): Promise<boolean> {
    switch (condition.type) {
      case "heartbeat_missing": {
        const lastHb = instance["lastHeartbeatAt"] as Date | null;
        if (!lastHb) return true;
        return Date.now() - new Date(lastHb).getTime() > condition.minutes * 60_000;
      }
      case "metric_threshold": {
        const metrics = instance["metrics"] as Record<string, unknown> | undefined;
        if (!metrics) return false;
        const val = metrics[condition.metric] as number | undefined;
        if (val === undefined) return false;
        switch (condition.operator) {
          case "gt": return val > condition.value;
          case "lt": return val < condition.value;
          case "gte": return val >= condition.value;
          case "lte": return val <= condition.value;
        }
        return false;
      }
      case "license_expiry_approaching": {
        const instanceId = instance["instanceId"] as string;
        const license = await this.db
          .collection(CP_COLLECTIONS.LICENSES)
          .findOne({ instanceId, revokedAt: null }, { sort: { expiresAt: -1 } });
        if (!license) return true;
        const daysLeft = (new Date(license["expiresAt"] as string).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        return daysLeft < condition.daysRemaining;
      }
      case "package_failed": {
        const instanceId = instance["instanceId"] as string;
        const failedCount = await this.db
          .collection(CP_COLLECTIONS.PACKAGE_ASSIGNMENTS)
          .countDocuments({ instanceId, status: "failed" });
        return failedCount >= condition.consecutiveFailures;
      }
      default:
        return false;
    }
  }

  private buildAlertDetail(condition: AlertCondition, instance: Record<string, unknown>): string {
    const name = instance["hospitalName"] as string ?? instance["instanceId"];
    switch (condition.type) {
      case "heartbeat_missing":
        return `${name}: No heartbeat received for ${condition.minutes} minutes`;
      case "metric_threshold":
        return `${name}: ${condition.metric} ${condition.operator} ${condition.value}`;
      case "license_expiry_approaching":
        return `${name}: License expires within ${condition.daysRemaining} days`;
      case "package_failed":
        return `${name}: ${condition.consecutiveFailures} consecutive package deployment failures`;
      default:
        return `Alert condition met for ${name}`;
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────

  async listRules(): Promise<AlertRule[]> {
    return this.rulesCol().find({}).toArray() as unknown as AlertRule[];
  }

  async createRule(rule: Omit<AlertRule, "ruleId" | "createdAt">): Promise<AlertRule> {
    const doc: AlertRule = {
      ...rule,
      ruleId: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    await this.rulesCol().insertOne(doc as any);
    return doc;
  }

  async updateRule(ruleId: string, updates: Partial<AlertRule>): Promise<void> {
    const { ruleId: _, createdAt: __, ...safe } = updates as any;
    await this.rulesCol().updateOne({ ruleId }, { $set: safe });
  }

  async listAlerts(filters: {
    status?: string;
    severity?: string;
    instanceId?: string;
    limit?: number;
  }): Promise<Alert[]> {
    const query: Record<string, unknown> = {};
    if (filters.status) query["status"] = filters.status;
    if (filters.severity) query["severity"] = filters.severity;
    if (filters.instanceId) query["instanceId"] = filters.instanceId;

    return this.alertsCol()
      .find(query)
      .sort({ firedAt: -1 })
      .limit(filters.limit ?? 100)
      .toArray() as unknown as Alert[];
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return this.alertsCol()
      .find({ status: { $in: ["firing", "acknowledged"] } })
      .sort({ firedAt: -1 })
      .toArray() as unknown as Alert[];
  }

  async acknowledgeAlert(alertId: string, staffId: string): Promise<void> {
    await this.alertsCol().updateOne(
      { alertId, status: "firing" },
      {
        $set: {
          status: "acknowledged",
          acknowledgedAt: new Date().toISOString(),
          acknowledgedBy: staffId,
        },
      },
    );
  }

  async getActiveAlertCount(): Promise<number> {
    return this.alertsCol().countDocuments({ status: "firing" });
  }
}
