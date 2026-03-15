/**
 * Heartbeat contract.
 *
 * Every 30 s the agent POSTs a HeartbeatPayload to the control-panel and
 * receives a HeartbeatResponse.  The payload is signed with the instance
 * RSA private key so the control-panel can verify authenticity.
 */

import type { ReconciliationSummary } from "./desired-state";

export interface SystemMetrics {
  cpuPercent: number;
  memoryPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskPercent: number;
  diskUsedGb: number;
  diskTotalGb: number;
  uptimeSeconds: number;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
}

export interface ApplicationMetrics {
  activePatients: number;
  activeUsers: number;
  httpRequestsPerMinute: number;
  httpErrorRate: number;       // 0–1 fraction
  dbQueryAvgMs: number;
  apiLatencyP95Ms: number;
}

export interface InstalledPackageSummary {
  packageId: string;
  version: string;
  status: "active" | "disabled" | "failed" | "pending_removal";
}

export interface HeartbeatPayload {
  instanceId: string;
  agentVersion: string;
  /** ISO-8601 */
  timestamp: string;
  system: SystemMetrics;
  application: ApplicationMetrics;
  installedPackages: InstalledPackageSummary[];
  /** Present when the previous reconciliation cycle completed */
  reconciliation?: ReconciliationSummary;
  /**
   * RSA-4096 signature (base64) over the canonical JSON of this payload
   * (signature field set to "" before signing).
   */
  signature: string;
}

export interface HeartbeatResponse {
  /** New signed license token (JWT) if the current one is near expiry */
  licenseToken?: string;
  /**
   * Desired-state document for this instance.
   * null means "no change since last heartbeat".
   */
  desiredStateVersion?: number;
  /** ISO-8601 server time for clock-skew detection */
  serverTime: string;
  /** Commands queued for this instance */
  pendingCommandCount: number;
}
