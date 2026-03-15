/**
 * Telemetry contract.
 *
 * Structured events emitted by the hospital CMS and collected by the
 * control-panel for analytics, alerting, and audit purposes.
 */

export type TelemetryEventCategory =
  | "auth"
  | "patient"
  | "billing"
  | "system"
  | "package"
  | "license"
  | "security";

export type TelemetrySeverity = "info" | "warn" | "error" | "critical";

export interface TelemetryEvent {
  /** UUID v4 */
  eventId: string;
  instanceId: string;
  category: TelemetryEventCategory;
  action: string;           // e.g. "user.login", "package.install"
  severity: TelemetrySeverity;
  /** ISO-8601 */
  occurredAt: string;
  /** Free-form key/value metadata — no PII allowed */
  meta: Record<string, string | number | boolean>;
}

/**
 * Batched telemetry payload posted by the agent to the control-panel
 * (piggybacked on the heartbeat or sent independently for high-severity
 * events that shouldn't wait for the next heartbeat cycle).
 */
export interface TelemetryBatch {
  instanceId: string;
  /** ISO-8601 */
  batchAt: string;
  events: TelemetryEvent[];
}

/**
 * Aggregated time-series entry returned by the control-panel analytics
 * API for charting purposes.
 */
export interface TelemetryTimeSeriesPoint {
  /** ISO-8601 bucket start time */
  bucket: string;
  count: number;
  errorCount: number;
  warnCount: number;
}

export interface TelemetryQueryResult {
  instanceId?: string;
  category?: TelemetryEventCategory;
  from: string;
  to: string;
  series: TelemetryTimeSeriesPoint[];
  totalEvents: number;
}
