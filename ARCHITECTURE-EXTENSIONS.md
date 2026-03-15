# Architecture Extensions — Enterprise Operational Maturity

This document defines concrete architectural extensions to the Hospital CMS platform
that close critical gaps between the current production-ready state and
enterprise-grade operational maturity.

Each section identifies what exists, what's missing, and provides implementable
changes with file paths, data structures, and integration points.

---

## 1. Instance Identity and Cryptographic Trust

### What Already Exists
- Instance UUID generated at registration (`instance.service.ts`)
- RSA-4096 key pair per instance (public key stored in control-panel)
- Signed heartbeats (agent signs with private key, CP verifies)
- Pre-auth registration tokens (single-use, 7-day TTL)
- 5-minute timestamp tolerance for replay protection

### What's Missing
- **Hardware fingerprint** — nothing ties the instance identity to actual hardware
- **Clone detection** — a copied database + state file produces a valid second instance
- **Certificate pinning** — agent doesn't pin the vendor's TLS certificate
- **Instance attestation** — no periodic proof that the instance is running on authorized hardware

### Extension Design

#### A. Hardware Fingerprint Binding

**New file:** `apps/agent/src/services/hardware-fingerprint.ts`

```typescript
export interface HardwareFingerprint {
  machineId: string;       // /etc/machine-id or SMBIOS UUID
  cpuModel: string;        // /proc/cpuinfo model name
  cpuCores: number;
  totalMemoryMB: number;
  primaryMacHash: string;  // SHA-256 of primary NIC MAC (hashed to avoid PII)
  diskSerialHash: string;  // SHA-256 of root disk serial
  osRelease: string;       // /etc/os-release PRETTY_NAME
}

// computeFingerprint(): HardwareFingerprint
// computeFingerprintHash(fp: HardwareFingerprint): string  // SHA-256 of canonical JSON
```

- Computed at agent startup and sent with every heartbeat
- Control-panel stores the fingerprint hash on first heartbeat
- Subsequent heartbeats with a different fingerprint hash trigger an alert
- Hash comparison allows vendor to detect instance cloning without storing raw hardware details

**Control-panel change:** `apps/control-panel/src/types.ts`

Add `hardwareFingerprint?: string` to `InstanceRecord`.

**Heartbeat schema change:** `apps/control-panel/src/routes/agent.ts`

Add `hardwareFingerprintHash: z.string().length(64).optional()` to HeartbeatSchema.

**Detection logic in `instance.service.ts`:**

```
On heartbeat:
  if instance.hardwareFingerprint is null:
    store the hash (first registration)
  else if hash !== stored hash:
    log alert: FINGERPRINT_MISMATCH
    flag instance for review
    do NOT reject heartbeat (may be legitimate hardware swap)
```

#### B. Instance Attestation Challenges

**New command type:** `ATTEST_IDENTITY`

Control-panel periodically issues an attestation challenge:

```typescript
{
  type: "ATTEST_IDENTITY",
  payload: { nonce: string, challengeId: string }
}
```

Agent must:
1. Compute hardware fingerprint
2. Sign `{ challengeId, nonce, fingerprint, timestamp }` with instance private key
3. Report result back via command result

This proves the instance still holds the private key AND runs on the same hardware.
A cloned instance would fail unless it also cloned the private key — which this detects
because two instances would respond to the same challenge.

#### Security Properties
- **Spoofing prevented by**: RSA-4096 signature on every heartbeat
- **Cloning detected by**: hardware fingerprint divergence + dual challenge responses
- **Fake telemetry blocked by**: signature verification before processing metrics
- **Unauthorized package access blocked by**: packages only delivered via signed desired-state to registered instances

---

## 2. Secure Update System

### What Already Exists
- Package system for themes/plugins/widgets
- RSA-signed manifests + SHA-256 integrity verification
- Desired-state reconciliation loop
- VENDOR_CDN_HOSTS allowlist for SSRF protection

### What's Missing
- **CMS runtime self-update** — no mechanism to update the API, web, agent, or installer
- **Staged rollout** — no canary/percentage-based deployment
- **Rollback on failure** — no automatic rollback if an update crashes the system
- **Version compatibility matrix** — no formal declaration of which agent versions work with which API versions

### Extension Design

#### A. Runtime Update Package Type

**Modify:** `packages/contracts/src/package-manifest.ts`

Add a fourth package type:

```typescript
export type PackageType = "theme" | "plugin" | "widget" | "runtime";

export interface RuntimePackageManifest extends BasePackageManifest {
  type: "runtime";
  /** Which runtime components this update targets */
  components: Array<"api" | "web" | "agent" | "installer">;
  /** Minimum current version required to install this update */
  minCurrentVersion: string;
  /** Maximum current version (if set, prevents skipping versions) */
  maxCurrentVersion?: string;
  /** Pre-update health checks the agent must pass */
  preUpdateChecks: Array<"disk_space" | "memory" | "no_active_encounters" | "backup_recent">;
  /** Post-update validation endpoint */
  healthCheckPath: string;
  /** Seconds to wait for health check to pass before rollback */
  healthCheckTimeoutSeconds: number;
  /** Shell script within the archive to execute the update */
  updateScript: string;
  /** Shell script to rollback if health check fails */
  rollbackScript: string;
}
```

#### B. Agent Update Orchestrator

**New file:** `apps/agent/src/reconciler/runtime-updater.ts`

```
class RuntimeUpdater:
  async applyUpdate(entry: EnrichedDesiredPackageEntry, manifest: RuntimePackageManifest):
    1. Run pre-update checks (disk ≥ 500MB free, memory ≥ 256MB free, etc.)
    2. Download + verify package (same pipeline as plugins)
    3. Create rollback snapshot:
       - Copy current binaries to /opt/hospital-cms/rollback/{version}/
       - Dump current package.json versions
    4. Extract update archive to staging directory
    5. Execute manifest.updateScript (sandboxed: no network, no env vars)
    6. Wait for health check:
       - Poll manifest.healthCheckPath every 5s
       - Timeout after manifest.healthCheckTimeoutSeconds
    7. If health check passes:
       - Remove rollback snapshot (keep last 3)
       - Report success to control-panel
    8. If health check fails:
       - Execute manifest.rollbackScript
       - Report failure with error details
       - Agent continues running on previous version
```

#### C. Staged Rollout

**New collection:** `cp_rollout_waves`

```typescript
interface RolloutWave {
  rolloutId: string;
  packageId: string;
  version: string;
  waves: Array<{
    waveNumber: number;
    instanceIds: string[];       // specific instances
    tierFilter?: string[];       // or by tier
    percentage?: number;         // or by random percentage
    scheduledAt: string;         // ISO-8601
    status: "pending" | "deploying" | "completed" | "failed" | "paused";
    completedAt?: string;
  }>;
  createdBy: string;
  createdAt: string;
  pausedAt?: string;
  cancelledAt?: string;
}
```

**New service:** `apps/control-panel/src/services/rollout.service.ts`

- `createRollout(packageId, version, waves[])` — define wave plan
- `advanceRollout(rolloutId)` — deploy next wave (creates assignments)
- `pauseRollout(rolloutId)` — halt further waves
- `cancelRollout(rolloutId)` — rollback all deployed waves
- Automatic wave advancement: after wave N completes with 0 failures, schedule wave N+1

**Vendor dashboard page:** `apps/vendor-dashboard/src/app/rollouts/page.tsx`

- Visual wave timeline
- Instance health per wave
- Pause/resume/cancel controls
- Failure rate threshold (auto-pause if >10% fail)

---

## 3. Backup and Disaster Recovery Awareness

### What Already Exists
- RUNBOOK.md documents backup procedures (mongodump)
- MongoDB replica set deployment guide in DEPLOYMENT.md
- No programmatic backup detection

### What's Missing
- **Runtime backup detection** — CMS doesn't know if backups are configured
- **Backup freshness reporting** — vendor has no visibility into client backup health
- **Backup health alerts** — no warnings when backups are stale or missing

### Extension Design

#### A. Backup Status Detector

**New file:** `apps/agent/src/services/backup-detector.ts`

```typescript
export interface BackupStatus {
  backupConfigured: boolean;
  lastBackupAt: string | null;     // ISO-8601
  lastBackupSizeBytes: number | null;
  backupMethod: "mongodump" | "lvm_snapshot" | "cloud_snapshot" | "unknown" | "none";
  backupLocation: "local" | "remote" | "cloud" | "unknown";
  staleDays: number;               // days since last backup
  healthy: boolean;                 // false if > 1 day stale or not configured
}
```

**Detection strategy:**

```
1. Check for mongodump artifacts:
   - Scan BACKUP_DIR (env var, default /var/backups/hospital-cms/)
   - Find newest directory matching mongodump naming pattern
   - Parse timestamp from directory name

2. Check for cron-scheduled backups:
   - Parse /etc/cron.d/*, /var/spool/cron/*, crontab -l
   - Look for mongodump or backup-related commands

3. Check MongoDB oplog position (for replica set):
   - rs.status() shows if secondaries are caught up
   - Oplog window indicates how far back you can recover

4. Report via heartbeat metrics:
   - backupStatus included in heartbeat payload
   - CP stores per-instance backup health
```

#### B. Control Panel Backup Dashboard

**Modify:** `apps/control-panel/src/types.ts`

Add `backupStatus?: BackupStatus` to heartbeat metrics processing.

**Modify:** `apps/control-panel/src/routes/agent.ts`

Add `backupStatus` to HeartbeatSchema (optional object).

Store backup status on instance record for dashboard display.

**Vendor dashboard:** Add backup health column to instances list page.

Color-coded indicators:
- Green: backup < 24h old
- Yellow: backup 1-3 days old
- Red: backup > 3 days old or not configured
- Gray: unknown (agent version too old)

#### C. Hospital-Side Backup Warning

**New file:** `apps/api/src/middleware/backup-warning.ts`

```typescript
// Middleware that sets a response header when backups are stale
// X-Backup-Warning: "Last backup was 3 days ago"
// Hospital frontend can display a persistent banner
```

**Modify:** `apps/web/src/app/dashboard/page.tsx`

Display a non-dismissible warning banner when backup status is unhealthy.

---

## 4. Operational Alerts and Incident Detection

### What Already Exists
- Metrics collection (CPU, memory, disk, encounters, uptime)
- Metric history stored in `cp_metrics_history`
- Network quality tracking
- Vendor audit log

### What's Missing
- **Alert rules** — no threshold-based alerting
- **Alert escalation** — no notification routing
- **Incident aggregation** — no correlation of related events
- **Alert history** — no record of triggered alerts

### Extension Design

#### A. Alert Rules Engine

**New collection:** `cp_alert_rules`

```typescript
interface AlertRule {
  ruleId: string;
  name: string;
  enabled: boolean;
  /** Which instances this applies to ("*" for all) */
  instanceFilter: string[] | "*";
  condition: AlertCondition;
  /** How long the condition must persist before firing */
  durationMinutes: number;
  severity: "critical" | "warning" | "info";
  /** Cooldown before re-firing the same alert */
  cooldownMinutes: number;
  createdBy: string;
  createdAt: string;
}

type AlertCondition =
  | { type: "metric_threshold"; metric: string; operator: "gt" | "lt" | "gte" | "lte"; value: number }
  | { type: "heartbeat_missing"; minutes: number }
  | { type: "package_failed"; consecutiveFailures: number }
  | { type: "error_rate"; threshold: number; windowMinutes: number }
  | { type: "license_expiry_approaching"; daysRemaining: number }
  | { type: "backup_stale"; daysStale: number };
```

**New collection:** `cp_alerts`

```typescript
interface Alert {
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
```

#### B. Alert Evaluation Service

**New file:** `apps/control-panel/src/services/alert-engine.service.ts`

```
class AlertEngineService:
  /** Called on a 1-minute interval via setInterval */
  async evaluate():
    for each enabled rule:
      for each matching instance:
        evaluate condition against latest metrics / heartbeat / assignment data
        if condition met AND duration threshold exceeded AND not in cooldown:
          fire alert (insert into cp_alerts)
        if previously firing AND condition no longer met:
          auto-resolve alert

  evaluateMetricThreshold(instanceId, condition):
    query cp_metrics_history for recent data points
    check if metric exceeds threshold for durationMinutes

  evaluateHeartbeatMissing(instanceId, condition):
    check instance.lastHeartbeatAt
    if now - lastHeartbeat > condition.minutes * 60_000: fire

  evaluatePackageFailed(instanceId, condition):
    query cp_package_assignments for consecutive failed reconciliations
```

**Wire into:** `apps/control-panel/src/server.ts`

```typescript
// Start alert evaluation loop (every 60 seconds)
const alertEngine = new AlertEngineService(db);
setInterval(() => alertEngine.evaluate().catch(err => logger.error({ err }, "Alert evaluation failed")), 60_000);
```

#### C. Default Alert Rules (Seeded)

```
1. instance_offline_critical:    heartbeat_missing > 15 min, severity=critical
2. instance_offline_warning:     heartbeat_missing > 5 min,  severity=warning
3. cpu_high:                     cpu > 90% for 5 min,        severity=warning
4. disk_critical:                disk > 95%,                 severity=critical
5. disk_warning:                 disk > 85%,                 severity=warning
6. memory_high:                  memory > 90% for 5 min,     severity=warning
7. license_expiring:             days_remaining < 14,         severity=warning
8. license_expiring_critical:    days_remaining < 3,          severity=critical
9. backup_stale:                 backup > 1 day stale,        severity=warning
10. backup_missing:              backup not configured,       severity=critical
11. package_deploy_failed:       3 consecutive failures,      severity=warning
```

#### D. Vendor Dashboard Alert Pages

**New file:** `apps/vendor-dashboard/src/app/alerts/page.tsx`

- Active alerts table with severity badges (critical=red, warning=yellow)
- Filter by instance, severity, status
- Acknowledge button (requires ALERT_MANAGE permission)
- Alert history with resolution timeline

**Modify:** `apps/vendor-dashboard/src/components/Shell.tsx`

- Add alert count badge to sidebar nav
- Add "Alerts" nav item with notification dot for unresolved critical alerts

#### E. API Routes

**New file:** `apps/control-panel/src/routes/alerts.ts`

```
GET  /api/vendor/alerts              — list alerts (filterable)
GET  /api/vendor/alerts/active       — active (firing) alerts only
PUT  /api/vendor/alerts/:alertId/ack — acknowledge
GET  /api/vendor/alert-rules         — list rules
POST /api/vendor/alert-rules         — create rule
PUT  /api/vendor/alert-rules/:ruleId — update rule
```

---

## 5. Feature Flags and Controlled Rollouts

### What Already Exists
- `DesiredStateDocument.featureFlags: Record<string, boolean>` — already in contracts
- `DesiredStateService.publish()` — merges featureFlags into desired state
- `requireFeature()` / `requireTier()` middleware — enforces features from license lease
- License tiers define feature sets (community/professional/enterprise)

### What's Missing
- **Vendor-controlled feature flags** — featureFlags field exists but no management UI or propagation
- **Flag targeting** — can't enable a flag for specific instances only
- **Emergency kill switch** — no fast path to disable a feature across all instances
- **Integration between license features and vendor flags** — they're separate systems

### Extension Design

#### A. Feature Flag Management Service

**New file:** `apps/control-panel/src/services/feature-flag.service.ts`

```typescript
interface FeatureFlag {
  flagId: string;              // e.g., "enable_fhir_export"
  name: string;
  description: string;
  defaultValue: boolean;
  /** Override rules evaluated top-to-bottom, first match wins */
  overrides: Array<{
    condition: FlagCondition;
    value: boolean;
    reason: string;
  }>;
  /** Emergency kill: overrides everything when true */
  killed: boolean;
  killedAt?: string;
  killedBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

type FlagCondition =
  | { type: "instance"; instanceIds: string[] }
  | { type: "tier"; tiers: string[] }
  | { type: "percentage"; percent: number; salt: string }
  | { type: "all" };
```

**Methods:**
- `resolveFlags(instanceId, tier): Record<string, boolean>` — evaluates all flags for an instance
- `killFlag(flagId, staffId)` — emergency disable
- `unkillFlag(flagId, staffId)` — re-enable
- Percentage-based: `hash(salt + instanceId) % 100 < percent`

#### B. Integration with Desired State

**Modify:** `apps/control-panel/src/services/desired-state-builder.service.ts`

```typescript
async rebuild(instanceId: string): Promise<DesiredStateDocument> {
  // ... existing package assignment logic ...

  // Resolve feature flags for this instance
  const instance = await instanceService.getByInstanceId(instanceId);
  const resolvedFlags = await featureFlagService.resolveFlags(
    instanceId,
    instance.tier,
  );

  const state = await this.desiredStateService.publish(instanceId, {
    packages,
    featureFlags: resolvedFlags,
  });
  // ...
}
```

#### C. Agent-Side Flag Application

**Modify:** `apps/agent/src/reconciler/reconciler.ts`

Add `reconcileFeatureFlags()` method:

```
For each flag in desired.featureFlags:
  Call POST /api/v1/system/config with { "feature.{flagName}": value }
```

**Modify:** `apps/api/src/middleware/feature-gate.ts`

Add `requireFlag(flagName)` middleware that checks feature flags from desired-state
config in addition to license features:

```typescript
export function requireFlag(flagName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const license = res.locals.license as ActiveLicenseContext;
    // Check license features first
    if (license.features.includes(flagName)) return next();
    // Check runtime feature flags (stored in local config)
    const flagValue = runtimeConfig.get(`feature.${flagName}`);
    if (flagValue === true || flagValue === "true") return next();
    next(new LicenseFeatureDisabledError(flagName));
  };
}
```

#### D. Vendor Dashboard

**New file:** `apps/vendor-dashboard/src/app/feature-flags/page.tsx`

- Flag list with current status (enabled/disabled/killed)
- Kill switch button (big red, requires confirmation)
- Override rule editor
- Percentage slider for gradual rollout
- Instance targeting via multi-select

---

## 6. Plugin and Widget Sandboxing

### What Already Exists
- Scoped `PluginApi` surface: storage, logging, permission assertion
- Storage isolation: per-plugin, per-hospital key scoping
- Manifest signature verification (RSA-4096)
- Event bus error isolation (failures logged, never propagated)
- Permission declarations in manifest

### What's Missing
- **Filesystem access restriction** — plugins loaded via dynamic import have full `fs` access
- **Network access restriction** — plugins can make arbitrary HTTP requests
- **Resource limits** — no CPU/memory limits on plugin execution
- **Secret leakage prevention** — plugins can read process.env
- **Module access restriction** — plugins can require any Node.js built-in

### Extension Design

#### A. Plugin Process Isolation

**New file:** `packages/plugin-runtime/src/isolated-runner.ts`

Move plugin execution into a `worker_threads` Worker with restricted capabilities:

```typescript
import { Worker } from "node:worker_threads";

class IsolatedPluginRunner {
  private worker: Worker;

  constructor(manifest: PluginManifest, pluginPath: string) {
    this.worker = new Worker(
      new URL("./plugin-worker.js", import.meta.url),
      {
        workerData: { manifest, pluginPath },
        // Restrict environment variables
        env: {
          NODE_ENV: process.env.NODE_ENV,
          // Only pass explicitly allowed vars
        },
        // Resource limits
        resourceLimits: {
          maxOldGenerationSizeMb: 128,    // 128MB heap per plugin
          maxYoungGenerationSizeMb: 32,
          codeRangeSizeMb: 16,
          stackSizeMb: 4,
        },
      },
    );
  }
}
```

#### B. Plugin Worker Sandbox

**New file:** `packages/plugin-runtime/src/plugin-worker.ts`

```typescript
// Runs inside worker_threads
// 1. Patch require/import to block dangerous modules:
//    - Blocked: fs, child_process, cluster, dgram, net, tls, worker_threads
//    - Allowed: crypto (for hashing), url, querystring, path (basename only)
// 2. Patch globalThis to remove:
//    - process.env (replaced with empty object)
//    - process.exit (no-op)
//    - process.kill (no-op)
// 3. Communication via parentPort (MessageChannel)
//    - Plugin calls sandbox API methods → messages to main thread
//    - Main thread executes DB operations and returns results
// 4. HTTP fetch patched to only allow VENDOR_CDN_HOSTS
```

#### C. Plugin API Proxy

Communication between worker and main thread via structured messages:

```typescript
// Worker sends:
{ type: "storage.get", requestId, args: { key } }
{ type: "storage.set", requestId, args: { key, value } }
{ type: "log.info", args: { message, context } }
{ type: "http.request", requestId, args: { url, method, headers, body } }

// Main thread replies:
{ type: "response", requestId, result: any, error?: string }
```

This ensures plugins never get direct access to the MongoDB driver,
filesystem, or network — everything goes through the supervised message channel.

#### D. Permissions Extension

**Modify:** `packages/contracts/src/package-manifest.ts`

Extend `permissions` in `PluginPackageManifest`:

```typescript
permissions: Array<
  | "storage:read" | "storage:write"
  | "events:subscribe" | "events:emit"
  | "http:vendor_cdn"      // can fetch from vendor CDN only
  | "http:external"        // can fetch from any HTTPS URL
  | "patients:read"        // can read patient data via sandbox API
  | "encounters:read"
>;
```

---

## 7. Package Migration System

### What Already Exists
- Package versioning (semver) in package registry
- Desired-state reconciliation handles install/update/remove
- Agent downloads and verifies packages before installation

### What's Missing
- **Database schema migrations** — when a plugin updates from v1 to v2, there's no mechanism
  to run database migrations (add indexes, transform data, create collections)
- **Rollback migrations** — no way to undo database changes on version downgrade
- **Migration ordering** — no guarantee of execution order
- **Migration verification** — no check that migrations completed successfully

### Extension Design

#### A. Migration Manifest Format

**Modify:** `packages/contracts/src/package-manifest.ts`

Add to `PluginPackageManifest`:

```typescript
/** Database migrations bundled with this version */
migrations?: PackageMigration[];
```

```typescript
export interface PackageMigration {
  /** Unique migration ID (e.g., "001_add_patient_alerts_index") */
  migrationId: string;
  /** Version this migration was introduced in */
  version: string;
  /** JavaScript file within the archive that exports up() and down() */
  scriptPath: string;
  /** Human-readable description */
  description: string;
  /** Estimated duration for progress reporting */
  estimatedDurationMs: number;
}
```

#### B. Migration Runner

**New file:** `apps/agent/src/reconciler/migration-runner.ts`

```typescript
class MigrationRunner {
  constructor(
    private readonly db: Db,
    private readonly packagesDir: string,
  ) {}

  /**
   * Runs all pending migrations for a package upgrade.
   * Migrations are idempotent — running the same migration twice is safe.
   */
  async runUpMigrations(
    packageId: string,
    fromVersion: string | null,
    toVersion: string,
    migrations: PackageMigration[],
  ): Promise<MigrationResult[]>

  /**
   * Runs down migrations for a rollback.
   */
  async runDownMigrations(
    packageId: string,
    fromVersion: string,
    toVersion: string,
    migrations: PackageMigration[],
  ): Promise<MigrationResult[]>
}
```

**New collection (hospital-side):** `package_migrations`

```typescript
interface MigrationRecord {
  packageId: string;
  migrationId: string;
  version: string;
  direction: "up" | "down";
  status: "pending" | "running" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  durationMs?: number;
}
```

#### C. Migration Execution Flow

```
1. Agent reconciler detects version change for a plugin
2. Download new package archive
3. Extract and find migrations/ directory
4. Query package_migrations collection for already-applied migrations
5. Determine pending migrations (present in manifest but not in DB)
6. Sort by version (semver order)
7. For each pending migration:
   a. Insert record with status="running"
   b. Load migration script: const { up } = await import(scriptPath)
   c. Execute up(db) within a try/catch
   d. On success: update status="completed"
   e. On failure: update status="failed", abort remaining migrations
8. If any migration fails:
   a. Do NOT activate the plugin
   b. Report failure in reconciliation summary
   c. Attempt to run down() for completed migrations (best-effort rollback)
```

#### D. Migration Script API

```typescript
// Example: plugins/patient-alerts/migrations/001_create_collections.ts
import type { Db } from "mongodb";

export async function up(db: Db): Promise<void> {
  await db.createCollection("patient_alert_rules");
  await db.collection("patient_alert_rules").createIndex(
    { patientId: 1, alertType: 1 },
    { unique: true },
  );
}

export async function down(db: Db): Promise<void> {
  await db.dropCollection("patient_alert_rules");
}
```

---

## 8. Diagnostics and Support Bundle

### What Already Exists
- System metrics collection (CPU, memory, disk)
- `GET /system/info` and `GET /system/metrics` endpoints
- Agent state file with installed packages
- Audit log with integrity verification
- Plugin registry with status tracking

### What's Missing
- **Consolidated diagnostics bundle** — no single-command way to collect all troubleshooting data
- **Secure transmission** — no mechanism to send bundle to vendor support
- **Sanitization** — must not include passwords, tokens, or patient data

### Extension Design

#### A. Diagnostics Collector

**New file:** `apps/agent/src/services/diagnostics-collector.ts`

```typescript
export interface DiagnosticsBundle {
  generatedAt: string;
  instanceId: string;
  agentVersion: string;

  system: {
    os: string;
    kernel: string;
    arch: string;
    cpuModel: string;
    cpuCores: number;
    totalMemoryMB: number;
    diskTotalGB: number;
    diskUsedGB: number;
    uptimeSeconds: number;
    nodeVersion: string;
    mongoVersion: string;
    redisVersion?: string;
  };

  license: {
    tier: string;
    features: string[];
    expiresAt: string;
    status: string;
  } | null;

  packages: Array<{
    packageId: string;
    packageType: string;
    version: string;
    status: string;
  }>;

  recentErrors: Array<{
    timestamp: string;
    source: string;
    message: string;
    stack?: string;
  }>;

  connectivity: {
    controlPanelReachable: boolean;
    controlPanelLatencyMs: number;
    databaseHealthy: boolean;
    databaseLatencyMs: number;
    redisHealthy: boolean;
  };

  configuration: {
    // Sanitized: only keys, not values for secrets
    envVarsPresent: string[];
    envVarsMissing: string[];
    heartbeatIntervalMs: number;
    lastHeartbeatAt: string | null;
    lastReconcileAt: string | null;
    desiredStateVersion: number;
  };

  auditChain: {
    totalEntries: number;
    chainValid: boolean;
    firstInvalidEntry?: string;
  };
}
```

#### B. Command-Triggered Collection

**New command type:** `COLLECT_DIAGNOSTICS`

```typescript
// Agent handler:
this.register("COLLECT_DIAGNOSTICS", async (payload) => {
  const bundle = await diagnosticsCollector.collect();
  const encrypted = encryptAes256Gcm(
    JSON.stringify(bundle),
    payload.encryptionKey, // one-time key from vendor
  );
  // Upload to control-panel
  await cpClient.uploadDiagnostics(encrypted);
  return { success: true, message: "Diagnostics uploaded" };
});
```

#### C. Control Panel Integration

**New endpoint:** `POST /api/agent/diagnostics/:instanceId`

Stores encrypted bundle in `cp_diagnostics` collection. Vendor staff can decrypt
and view via the dashboard.

**Vendor dashboard page:** `apps/vendor-dashboard/src/app/diagnostics/page.tsx`

- Request diagnostics button (issues COLLECT_DIAGNOSTICS command)
- View previous bundles per instance
- Collapsible sections for system, license, packages, errors, connectivity

#### D. Sanitization Rules

The diagnostics collector MUST:
- Hash or omit all environment variable values (only report key names)
- Exclude patient data entirely
- Exclude JWT tokens, API keys, private keys
- Truncate error stacks to 10 frames
- Limit recent errors to last 100 entries
- AES-256-GCM encrypt before transmission

---

## 9. Rate Limiting and Abuse Protection

### What Already Exists
- **Hospital API**: Global (configurable), auth-specific (20/15min), write-specific (60/min)
- **Control panel**: Global (500/15min), agent (120/min), registration (10/hr)
- Per-user keying on hospital API
- `skipSuccessfulRequests` on auth routes

### What's Missing
- **Account lockout** — hospital-side login has rate limiting but no account lockout after N failures
- **IP-based progressive delays** — no exponential backoff per IP
- **API key abuse detection** — no detection of automated scraping patterns
- **Per-instance rate limiting** — all instances share the same CP rate limit pool

### Extension Design

#### A. Hospital-Side Account Lockout

**Modify:** `apps/api/src/routes/auth.routes.ts`

```typescript
// After failed login:
await db.collection("users").updateOne(
  { _id: userId },
  {
    $inc: { failedLoginAttempts: 1 },
    $set: { lastFailedLoginAt: new Date() },
  },
);

// Check lockout threshold:
if (user.failedLoginAttempts >= 5) {
  const lockDuration = Math.min(
    30 * Math.pow(2, user.failedLoginAttempts - 5), // 30s, 60s, 120s, 240s...
    1800, // max 30 minutes
  );
  if (now - user.lastFailedLoginAt < lockDuration * 1000) {
    throw new AccountLockedError(lockDuration);
  }
}

// On successful login:
await db.collection("users").updateOne(
  { _id: userId },
  { $set: { failedLoginAttempts: 0, lastFailedLoginAt: null } },
);
```

#### B. Per-Instance Rate Limiting on Control Panel

**Modify:** `apps/control-panel/src/routes/agent.ts`

Add instance-level rate limiting to heartbeat:

```typescript
const instanceRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 4, // max 4 heartbeats per minute per instance (normal is 2)
  keyGenerator: (req) => {
    const body = req.body as { instanceId?: string };
    return body?.instanceId ?? req.ip ?? "unknown";
  },
});
```

#### C. Suspicious Pattern Detection

**Modify:** `apps/control-panel/src/services/instance.service.ts`

Track heartbeat anomalies:

```
- Rapid heartbeat bursts (>10/min) → log + rate limit
- Clock skew increasing → log warning
- Agent version regression (newer → older) → alert
- Sudden metric jumps (CPU 5% → 100% in one cycle) → alert
```

---

## 10. Secret and Key Rotation

### What Already Exists
- `ROTATE_KEYS` command type (agent handler is a placeholder)
- License rotation via `POST /system/license/rotate` with monotonicity check
- MFA secrets encrypted with AES-256-GCM (MFA_ENCRYPTION_KEY)
- HMAC vendor auth with shared secret

### What's Missing
- **Coordinated key rotation protocol** — ROTATE_KEYS is a placeholder; no actual key swap
- **Instance RSA key rotation** — instance can't rotate its RSA key pair
- **Vendor signing key rotation** — switching to a new vendor key breaks all instances
- **Agent credential rotation** — no rotation for API_ADMIN_TOKEN
- **Zero-downtime rotation** — no overlapping validity window

### Extension Design

#### A. Instance Key Rotation Protocol

**New command type:** `ROTATE_INSTANCE_KEY`

```
Vendor initiates key rotation:
1. CP issues ROTATE_INSTANCE_KEY command
2. Agent generates new RSA-4096 key pair
3. Agent signs { oldPublicKey, newPublicKey, timestamp } with OLD private key
4. Agent sends signed key rotation request to CP
5. CP verifies signature with stored old public key
6. CP stores new public key (keeps old for 24h grace period)
7. Agent switches to new private key for future heartbeats
8. CP accepts heartbeats signed by either key during grace period
9. After 24h, CP removes old key
```

**New endpoint:** `POST /api/agent/rotate-key`

```typescript
body: {
  instanceId: string;
  oldPublicKeyFingerprint: string;  // SHA-256 of old public key
  newPublicKey: string;             // PEM
  timestamp: number;
  signature: string;                // signed with OLD private key
}
```

#### B. Vendor Signing Key Rotation

**Design:** Dual-key verification window

```
1. Generate new vendor RSA key pair: vendor-key-v2
2. Update CP to sign with v2 (publicKeyId: "vendor-key-v2")
3. Push new vendor public key to all agents via desired-state config:
   { "vendor_public_key_v2": "<PEM>" }
4. Agent stores both v1 and v2 public keys
5. Agent verifies signatures against publicKeyId in manifest
6. After all instances report receipt of v2:
   - Yank v1 from desired-state config
   - Agent removes v1 after 7-day grace
```

**Modify:** `packages/plugin-runtime/src/manifest-validator.ts`

Support multiple vendor public keys indexed by `publicKeyId`:

```typescript
function verifyManifestSignature(
  manifest: PluginManifest,
  vendorPublicKeys: Record<string, string>, // keyId → PEM
): void {
  const keyPem = vendorPublicKeys[manifest.publicKeyId];
  if (!keyPem) throw new PluginSignatureError("Unknown publicKeyId");
  // verify with matching key
}
```

#### C. Admin Token Rotation

**New command type:** `ROTATE_ADMIN_TOKEN`

```
1. Agent generates new secure random token (32 bytes)
2. Agent calls POST /api/v1/system/admin-token/rotate with:
   { newTokenHash: sha256(newToken), signature: sign(payload, instanceKey) }
3. Hospital API verifies instance signature
4. Hospital API stores newTokenHash, keeps old for 5 min
5. Agent switches to new token
6. After 5 min, old token is rejected
```

---

## 11. Future Multi-Tenant Readiness

### What Already Exists
- Single-tenant per instance (each hospital has own MongoDB)
- `instanceId` scoping on control-plane
- `hospitalId` scoping on audit logs
- Clear separation between vendor (control-panel) and client (api/web)

### What's Missing
- **Database isolation model** — no tenancy abstraction for shared-DB deployments
- **Config isolation** — environment-based config assumes single tenant
- **Session isolation** — sessions stored with no tenant boundary
- **Route isolation** — no tenant prefix or header routing

### Extension Design

The goal is NOT to implement multi-tenancy now, but to structure the code so
that adding it later requires minimal changes.

#### A. Tenant Context Abstraction

**New file:** `packages/database/src/tenant-context.ts`

```typescript
export interface TenantContext {
  tenantId: string;
  databaseName: string;
  /** In single-tenant mode, this is always the default DB */
  /** In multi-tenant mode, each tenant gets a prefixed DB or separate DB */
}

export function createTenantContext(
  mode: "single" | "multi",
  tenantId?: string,
): TenantContext {
  if (mode === "single") {
    return {
      tenantId: "default",
      databaseName: process.env.MONGODB_DB_NAME ?? "hospital_cms",
    };
  }
  return {
    tenantId: tenantId!,
    databaseName: `hospital_cms_${tenantId}`,
  };
}
```

#### B. Repository Tenant Scoping

**Modify:** All repository constructors to accept `TenantContext`:

```typescript
class PatientRepository {
  constructor(
    private readonly client: MongoClient,
    private readonly tenant: TenantContext,
  ) {}

  private col() {
    return this.client.db(this.tenant.databaseName).collection("patients");
  }
}
```

In single-tenant mode (current), `tenant.databaseName` is always the same DB.
In future multi-tenant mode, each request resolves a tenant from the
subdomain/header and passes the appropriate context.

#### C. Request-Level Tenant Resolution

**New file:** `apps/api/src/middleware/tenant-resolver.ts`

```typescript
// For now, returns the single tenant context
// In the future, resolves from:
//   - X-Tenant-Id header (API clients)
//   - subdomain (web UI: hospital-a.cms.example.com)
//   - JWT claim (embedded tenantId in auth token)

export function resolveTenant() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.locals.tenant = createTenantContext("single");
    next();
  };
}
```

#### D. Data Model Annotations

Add `tenantId` as an optional indexed field to the following collections
(but don't enforce it in single-tenant mode):

- `users` — which tenant this user belongs to
- `patients` — tenant boundary for data access
- `encounters` — tenant boundary
- `audit_logs` — tenant scoping for log queries
- `plugin_storage` — already scoped by `hospitalId`, which maps to `tenantId`

This is a preparatory measure. The field is present but unused in single-tenant
deployments. When multi-tenancy is enabled, it becomes the primary partition key.

---

## 12. Anomaly and Tampering Detection

### What Already Exists
- Audit log SHA-256 hash chain with `verifyChainIntegrity()`
- RSA signature verification on all heartbeats, commands, packages, licenses
- Hardware fingerprint binding (proposed in Section 1)
- License lease monotonicity checks

### What's Missing
- **Runtime binary integrity** — no check that the running code matches expected checksums
- **Instance cloning detection** — no real-time detection beyond fingerprint (Section 1)
- **Behavioral anomaly detection** — no baseline comparison for normal operation patterns
- **License bypass detection** — no check for modified license guard middleware
- **Clock tampering detection** — instances could advance system clock to extend licenses

### Extension Design

#### A. Runtime Integrity Attestation

**New file:** `apps/agent/src/services/integrity-checker.ts`

```typescript
export interface IntegrityReport {
  /** SHA-256 of all .js files in the api/dist directory */
  runtimeHash: string;
  /** SHA-256 of package-lock.json / node_modules structure */
  dependencyHash: string;
  /** SHA-256 of critical config files */
  configHash: string;
  /** Whether any files were modified since last check */
  filesModified: string[];
  /** Process metadata */
  processUid: number;
  processGid: number;
  /** Node.js flags that could weaken security */
  unsafeFlags: string[];  // e.g., --no-warnings, --inspect
  computedAt: string;
}

class IntegrityChecker {
  /** Compute hashes of critical runtime files */
  async computeIntegrity(): Promise<IntegrityReport>

  /** Compare against previously stored baseline */
  async detectTampering(baseline: IntegrityReport): Promise<string[]>
}
```

The agent computes an integrity report periodically (every hour) and includes
the `runtimeHash` in the heartbeat payload. The control panel stores the
expected hash per agent version. A mismatch triggers an alert.

#### B. Behavioral Baseline and Anomaly Scoring

**New file:** `apps/control-panel/src/services/anomaly-detector.service.ts`

```typescript
interface BehavioralBaseline {
  instanceId: string;
  /** Rolling averages computed over 7-day window */
  avgCpuPercent: number;
  avgMemoryPercent: number;
  avgDiskPercent: number;
  avgHeartbeatIntervalMs: number;
  avgActiveEncounters: number;
  avgRequestsPerMinute: number;
  stdDevCpu: number;
  stdDevMemory: number;
  stdDevHeartbeatInterval: number;
  computedAt: string;
}

class AnomalyDetectorService {
  /**
   * Score an incoming heartbeat against the baseline.
   * Returns 0.0 (normal) to 1.0 (highly anomalous).
   */
  scoreHeartbeat(
    instanceId: string,
    metrics: SystemMetrics,
    baseline: BehavioralBaseline,
  ): number

  /**
   * Recompute baseline from last 7 days of metrics history.
   * Called daily via cron.
   */
  async recomputeBaseline(instanceId: string): Promise<BehavioralBaseline>
}
```

**Anomaly indicators scored:**

| Signal | Weight | Detection |
|--------|--------|-----------|
| CPU > baseline + 3σ | 0.15 | Cryptomining, DoS |
| Memory > baseline + 3σ | 0.10 | Memory leak, attack |
| Heartbeat interval variance > 3σ | 0.10 | Network manipulation |
| Sudden metric flatline | 0.20 | Replayed/cached metrics |
| Agent version downgrade | 0.15 | Tampering |
| Runtime hash mismatch | 0.30 | Binary modification |
| Clock skew > 30 seconds | 0.15 | Time manipulation |
| Fingerprint change | 0.25 | Instance cloning |
| Duplicate nonces across instances | 0.30 | State file cloning |

Scores > 0.5 trigger a `warning` alert. Scores > 0.8 trigger a `critical` alert
and automatically suspend the license lease (restricted mode).

#### C. Clock Drift Detection

**Modify:** `apps/control-panel/src/routes/agent.ts`

```typescript
// Already have: const age = Date.now() - payload.timestamp;
// Add clock drift tracking:
const clockDrift = Date.now() - payload.timestamp;
if (Math.abs(clockDrift) > 30_000) {
  // 30-second drift — suspicious
  await alertEngine.fireIfNeeded("clock_drift", instanceId, {
    driftMs: clockDrift,
  });
}

// Track drift over time to detect gradual manipulation
await db.collection(CP_COLLECTIONS.METRICS_HISTORY).updateOne(
  { instanceId: payload.instanceId, recordedAt: now },
  { $set: { clockDriftMs: clockDrift } },
);
```

#### D. Duplicate Instance Detection

**Modify:** `apps/control-panel/src/services/instance.service.ts`

```typescript
// During heartbeat processing:
// Check if two heartbeats from different IPs arrived within 5 seconds
// for the same instanceId — indicates cloning

const recentHeartbeat = await col().findOne({
  instanceId: payload.instanceId,
  lastHeartbeatAt: { $gte: new Date(Date.now() - 5000) },
  lastHeartbeatIp: { $ne: sourceIp },
});

if (recentHeartbeat) {
  await alertEngine.fire("duplicate_instance_detected", {
    instanceId: payload.instanceId,
    ip1: recentHeartbeat.lastHeartbeatIp,
    ip2: sourceIp,
    severity: "critical",
  });
}
```

#### E. Nonce Replay Detection

**New collection:** `cp_heartbeat_nonces` (TTL: 10 minutes)

```typescript
// On each heartbeat, store the nonce:
await db.collection("cp_heartbeat_nonces").insertOne({
  nonce: payload.nonce,
  instanceId: payload.instanceId,
  receivedAt: new Date(),
});

// Check for reuse:
const duplicate = await db.collection("cp_heartbeat_nonces").findOne({
  nonce: payload.nonce,
  instanceId: { $ne: payload.instanceId }, // same nonce, different instance = cloning
});

if (duplicate) {
  // Alert: state file was likely cloned between instances
}
```

---

## Implementation Priority

### Phase 1: Critical Security (Week 1-2)
1. **Account lockout** (Section 9A) — immediate security improvement
2. **Hardware fingerprint** (Section 1A) — clone detection foundation
3. **Nonce replay detection** (Section 12E) — prevents heartbeat replay
4. **Clock drift detection** (Section 12C) — detects time manipulation

### Phase 2: Operational Visibility (Week 3-4)
5. **Alert rules engine** (Section 4) — proactive monitoring
6. **Backup health detection** (Section 3) — critical for hospitals
7. **Diagnostics bundle** (Section 8) — support efficiency

### Phase 3: Advanced Security (Week 5-6)
8. **Runtime integrity attestation** (Section 12A) — tamper detection
9. **Instance key rotation protocol** (Section 10A) — key hygiene
10. **Behavioral anomaly detection** (Section 12B) — advanced threat detection

### Phase 4: Operational Excellence (Week 7-8)
11. **Feature flag management** (Section 5) — controlled rollouts
12. **Package migration system** (Section 7) — safe plugin upgrades
13. **Staged rollout system** (Section 2C) — safe deployments

### Phase 5: Future-Proofing (Week 9-10)
14. **Plugin process isolation** (Section 6A) — deep sandboxing
15. **Runtime update system** (Section 2A-B) — CMS self-update
16. **Multi-tenant abstractions** (Section 11) — preparatory only
17. **Vendor signing key rotation** (Section 10B) — key lifecycle

---

## New Collections Summary

| Collection | Purpose | TTL |
|------------|---------|-----|
| `cp_alert_rules` | Alert rule definitions | — |
| `cp_alerts` | Triggered alert instances | 1 year |
| `cp_rollout_waves` | Staged deployment plans | 1 year |
| `cp_feature_flags` | Vendor-controlled feature flags | — |
| `cp_diagnostics` | Encrypted support bundles | 30 days |
| `cp_heartbeat_nonces` | Replay detection | 10 min |
| `cp_behavioral_baselines` | Anomaly detection baselines | — |
| `package_migrations` (hospital) | Plugin migration tracking | — |

## New Permissions

| Permission | Used By |
|------------|---------|
| `alert:view` | View alerts and alert rules |
| `alert:manage` | Acknowledge alerts, create/edit rules |
| `rollout:view` | View rollout plans |
| `rollout:manage` | Create, pause, cancel rollouts |
| `flag:view` | View feature flags |
| `flag:manage` | Create, edit, kill feature flags |
| `diagnostics:request` | Request diagnostics bundle |
| `diagnostics:view` | View diagnostics bundles |

---

## Architectural Principles Maintained

1. **Client runs locally** — all extensions respect the self-hosted model
2. **Vendor retains authority** — all new controls originate from vendor CP
3. **Outbound-only communication** — hospital never opens inbound ports
4. **Cryptographic trust chain** — all new data flows are signed/verified
5. **Existing code extended, not replaced** — all changes are additive
6. **Backward compatibility** — new heartbeat fields are optional (old agents still work)
