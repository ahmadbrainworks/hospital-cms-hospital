import { Db } from "mongodb";

export const CP_COLLECTIONS = {
  INSTANCES: "cp_instances",
  LICENSES: "cp_licenses",
  COMMANDS: "cp_commands",
  METRICS_HISTORY: "cp_metrics_history",
  AUDIT_LOG: "cp_audit_log",
  REGISTRATION_TOKENS: "cp_registration_tokens",
  PACKAGES: "cp_packages",
  DESIRED_STATES: "cp_desired_states",
  RECONCILIATION_HISTORY: "cp_reconciliation_history",
  TELEMETRY_EVENTS: "cp_telemetry_events",
  PACKAGE_ASSIGNMENTS: "cp_package_assignments",
  PACKAGE_AUDIT: "cp_package_audit",
  STAFF: "cp_staff",
  STAFF_SESSIONS: "cp_staff_sessions",
  STAFF_AUDIT: "cp_staff_audit",
  HEARTBEAT_NONCES: "cp_heartbeat_nonces",
  ALERT_RULES: "cp_alert_rules",
  ALERTS: "cp_alerts",
  FEATURE_FLAGS: "cp_feature_flags",
  ROLLOUT_WAVES: "cp_rollout_waves",
  DIAGNOSTICS: "cp_diagnostics",
  BEHAVIORAL_BASELINES: "cp_behavioral_baselines",
} as const;

export async function ensureControlPanelIndexes(db: Db): Promise<void> {
  await Promise.all([
    db
      .collection(CP_COLLECTIONS.INSTANCES)
      .createIndex({ instanceId: 1 }, { unique: true }),
    db
      .collection(CP_COLLECTIONS.INSTANCES)
      .createIndex({ hospitalSlug: 1 }, { unique: true }),
    db
      .collection(CP_COLLECTIONS.INSTANCES)
      .createIndex({ lastHeartbeatAt: -1 }),

    db
      .collection(CP_COLLECTIONS.LICENSES)
      .createIndex({ licenseId: 1 }, { unique: true }),
    db.collection(CP_COLLECTIONS.LICENSES).createIndex({ instanceId: 1 }),
    db.collection(CP_COLLECTIONS.LICENSES).createIndex({ expiresAt: 1 }),

    db
      .collection(CP_COLLECTIONS.COMMANDS)
      .createIndex({ commandId: 1 }, { unique: true }),
    db
      .collection(CP_COLLECTIONS.COMMANDS)
      .createIndex({ instanceId: 1, executedAt: 1 }),
    db
      .collection(CP_COLLECTIONS.COMMANDS)
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),

    db
      .collection(CP_COLLECTIONS.METRICS_HISTORY)
      .createIndex({ instanceId: 1, recordedAt: -1 }),
    db.collection(CP_COLLECTIONS.METRICS_HISTORY).createIndex(
      { recordedAt: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 90 }, // 90-day retention
    ),

    // Registration tokens — auto-expire via MongoDB TTL
    db.collection(CP_COLLECTIONS.REGISTRATION_TOKENS).createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
    db
      .collection(CP_COLLECTIONS.REGISTRATION_TOKENS)
      .createIndex({ token: 1 }, { unique: true }),

    // Package registry
    db
      .collection(CP_COLLECTIONS.PACKAGES)
      .createIndex({ packageId: 1, version: 1 }, { unique: true }),
    db.collection(CP_COLLECTIONS.PACKAGES).createIndex({ type: 1, yanked: 1 }),
    db.collection(CP_COLLECTIONS.PACKAGES).createIndex({ publishedAt: -1 }),

    // Desired state — one document per instance
    db
      .collection(CP_COLLECTIONS.DESIRED_STATES)
      .createIndex({ instanceId: 1 }, { unique: true }),

    // Reconciliation history — 90-day retention
    db
      .collection(CP_COLLECTIONS.RECONCILIATION_HISTORY)
      .createIndex({ instanceId: 1, recordedAt: -1 }),
    db.collection(CP_COLLECTIONS.RECONCILIATION_HISTORY).createIndex(
      { recordedAt: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 90 },
    ),

    // Telemetry events — 30-day retention
    db
      .collection(CP_COLLECTIONS.TELEMETRY_EVENTS)
      .createIndex({ instanceId: 1, occurredAt: -1 }),
    db.collection(CP_COLLECTIONS.TELEMETRY_EVENTS).createIndex({ category: 1 }),
    db.collection(CP_COLLECTIONS.TELEMETRY_EVENTS).createIndex(
      { occurredAt: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 30 },
    ),

    // Package assignments — one assignment per package per hospital
    db
      .collection(CP_COLLECTIONS.PACKAGE_ASSIGNMENTS)
      .createIndex({ instanceId: 1, packageId: 1 }, { unique: true }),
    db
      .collection(CP_COLLECTIONS.PACKAGE_ASSIGNMENTS)
      .createIndex({ instanceId: 1, status: 1 }),
    db
      .collection(CP_COLLECTIONS.PACKAGE_ASSIGNMENTS)
      .createIndex({ packageId: 1 }),
    db
      .collection(CP_COLLECTIONS.PACKAGE_ASSIGNMENTS)
      .createIndex({ assignedBy: 1, assignedAt: -1 }),

    // Package audit — 1-year retention
    db
      .collection(CP_COLLECTIONS.PACKAGE_AUDIT)
      .createIndex({ packageId: 1, timestamp: -1 }),
    db
      .collection(CP_COLLECTIONS.PACKAGE_AUDIT)
      .createIndex({ instanceId: 1, timestamp: -1 }),
    db.collection(CP_COLLECTIONS.PACKAGE_AUDIT).createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 365 },
    ),

    // Staff accounts
    db
      .collection(CP_COLLECTIONS.STAFF)
      .createIndex({ email: 1 }, { unique: true }),
    db
      .collection(CP_COLLECTIONS.STAFF)
      .createIndex({ username: 1 }, { unique: true }),
    db.collection(CP_COLLECTIONS.STAFF).createIndex({ status: 1 }),

    // Staff sessions — TTL auto-expire
    db
      .collection(CP_COLLECTIONS.STAFF_SESSIONS)
      .createIndex({ sessionId: 1 }, { unique: true }),
    db
      .collection(CP_COLLECTIONS.STAFF_SESSIONS)
      .createIndex({ staffId: 1 }),
    db.collection(CP_COLLECTIONS.STAFF_SESSIONS).createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),

    // Staff audit — 1-year retention
    db
      .collection(CP_COLLECTIONS.STAFF_AUDIT)
      .createIndex({ staffId: 1, timestamp: -1 }),
    db
      .collection(CP_COLLECTIONS.STAFF_AUDIT)
      .createIndex({ action: 1 }),
    db.collection(CP_COLLECTIONS.STAFF_AUDIT).createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 365 },
    ),

    // Heartbeat nonces — 10-minute TTL for replay detection
    db
      .collection(CP_COLLECTIONS.HEARTBEAT_NONCES)
      .createIndex({ nonce: 1 }, { unique: true }),
    db
      .collection(CP_COLLECTIONS.HEARTBEAT_NONCES)
      .createIndex({ instanceId: 1 }),
    db.collection(CP_COLLECTIONS.HEARTBEAT_NONCES).createIndex(
      { receivedAt: 1 },
      { expireAfterSeconds: 600 }, // 10 minutes
    ),

    // Alert rules
    db
      .collection(CP_COLLECTIONS.ALERT_RULES)
      .createIndex({ ruleId: 1 }, { unique: true }),
    db.collection(CP_COLLECTIONS.ALERT_RULES).createIndex({ enabled: 1 }),

    // Alerts — 1-year retention
    db
      .collection(CP_COLLECTIONS.ALERTS)
      .createIndex({ alertId: 1 }, { unique: true }),
    db.collection(CP_COLLECTIONS.ALERTS).createIndex({ instanceId: 1, status: 1 }),
    db.collection(CP_COLLECTIONS.ALERTS).createIndex({ ruleId: 1 }),
    db.collection(CP_COLLECTIONS.ALERTS).createIndex({ status: 1, severity: 1 }),
    db.collection(CP_COLLECTIONS.ALERTS).createIndex(
      { firedAt: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 365 },
    ),

    // Feature flags
    db
      .collection(CP_COLLECTIONS.FEATURE_FLAGS)
      .createIndex({ flagId: 1 }, { unique: true }),

    // Rollout waves — 1-year retention
    db
      .collection(CP_COLLECTIONS.ROLLOUT_WAVES)
      .createIndex({ rolloutId: 1 }, { unique: true }),
    db.collection(CP_COLLECTIONS.ROLLOUT_WAVES).createIndex({ packageId: 1 }),
    db.collection(CP_COLLECTIONS.ROLLOUT_WAVES).createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 365 },
    ),

    // Diagnostics — 30-day retention
    db.collection(CP_COLLECTIONS.DIAGNOSTICS).createIndex({ instanceId: 1, createdAt: -1 }),
    db.collection(CP_COLLECTIONS.DIAGNOSTICS).createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 30 },
    ),

    // Behavioral baselines
    db
      .collection(CP_COLLECTIONS.BEHAVIORAL_BASELINES)
      .createIndex({ instanceId: 1 }, { unique: true }),
  ]);
}
