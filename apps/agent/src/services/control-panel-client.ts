import { createLogger } from "@hospital-cms/logger";
import { generateNonce } from "@hospital-cms/crypto";
import { signWithPrivateKey } from "@hospital-cms/crypto-vendor";
import type { EnrichedDesiredStateDocument, ReconciliationSummary } from "@hospital-cms/contracts";
import type { AgentConfig } from "../config";
import type { CommandRecord, InstalledPackage } from "./types";
import { getHardwareFingerprintHash } from "./hardware-fingerprint";
import { detectBackupStatus } from "./backup-detector";
import https from "node:https";

const logger = createLogger({ module: "ControlPanelClient" });

export interface HeartbeatResponse {
  desiredState: EnrichedDesiredStateDocument | null;
  pendingCommands: CommandRecord[];
  license: {
    tier: string;
    features: string[];
    maxBeds: number;
    expiresAt: string;
    issuedAt: string;
    signature: string;
  } | null;
  serverTime: number;
}

interface SystemMetrics {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  activeEncounters: number;
  totalPatients: number;
  uptimeSeconds: number;
}

export class ControlPanelClient {
  private readonly baseUrl: string;
  private readonly instanceId: string;
  private privateKey: string;
  private readonly agentVersion: string;

  constructor(config: AgentConfig) {
    this.baseUrl = config.CONTROL_PANEL_URL;
    this.instanceId = config.INSTANCE_ID;
    this.privateKey = config.AGENT_PRIVATE_KEY;
    this.agentVersion = config.AGENT_VERSION;
  }

  /** Get the current private key (used by key rotator). */
  getPrivateKey(): string {
    return this.privateKey;
  }

  /** Update the private key after rotation. */
  setPrivateKey(newKey: string): void {
    this.privateKey = newKey;
  }

  async sendHeartbeat(
    metrics: SystemMetrics,
    networkQuality: "excellent" | "good" | "degraded" | "offline",
    currentPackages: InstalledPackage[],
    reconciliation?: ReconciliationSummary,
  ): Promise<HeartbeatResponse> {
    const timestamp = Date.now();
    const nonce = generateNonce();

    const unsigned: Record<string, unknown> = {
      instanceId: this.instanceId,
      agentVersion: this.agentVersion,
      metrics,
      networkQuality,
      currentPackages,
      timestamp,
      nonce,
      hardwareFingerprintHash: getHardwareFingerprintHash(),
      backupStatus: detectBackupStatus(),
    };

    if (reconciliation) {
      unsigned["reconciliation"] = reconciliation;
    }

    const signedData = JSON.stringify(unsigned, Object.keys(unsigned).sort());
    const signature = signWithPrivateKey(
      Buffer.from(signedData),
      this.privateKey,
    );

    const payload = { ...unsigned, signature };

    const response = await this.fetchWithRetry(
      `${this.baseUrl}/api/agent/heartbeat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const json = (await response.json()) as {
      success: boolean;
      data?: HeartbeatResponse;
      error?: { code: string; message: string; details?: unknown };
    };
    if (!json.success) {
      const errorMsg = json.error?.message ?? "Unknown error";
      const errorCode = json.error?.code ?? "UNKNOWN";
      throw new Error(`Heartbeat rejected: ${errorCode} - ${errorMsg}`);
    }

    return json.data as HeartbeatResponse;
  }

  async reportCommandResult(
    commandId: string,
    success: boolean,
    message: string,
  ): Promise<void> {
    const timestamp = Date.now();
    const unsigned = { commandId, instanceId: this.instanceId, success, message, timestamp };
    const signedData = JSON.stringify(unsigned, Object.keys(unsigned).sort());
    const signature = signWithPrivateKey(Buffer.from(signedData), this.privateKey);

    await this.fetchWithRetry(
      `${this.baseUrl}/api/agent/commands/${commandId}/result`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Instance-Id": this.instanceId,
        },
        body: JSON.stringify({ ...unsigned, signature }),
      },
    );
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 5,
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.httpsRequest(url, options);
        if (!response.ok && response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }
        logger.info({ attempt, url }, "Request succeeded after retries");
        return response;
      } catch (err) {
        lastError = err as Error;
        const isLastAttempt = attempt === maxRetries;
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);

        if (isLastAttempt) {
          logger.error(
            { attempt, url, maxRetries, err: lastError.message },
            "Request failed after all retries",
          );
        } else {
          logger.warn(
            { attempt, maxRetries, url, delay, err: lastError.message },
            "Request failed, retrying",
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error("Max retries exceeded");
  }

  private httpsRequest(url: string, options: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
      const timeout = 30000;
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      try {
        // Convert headers to https module format
        const headers: Record<string, string> = {};
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
          });
        } else if (typeof options.headers === 'object' && options.headers) {
          Object.entries(options.headers as Record<string, string>).forEach(([key, value]) => {
            headers[key.toLowerCase()] = value;
          });
        }

        const reqOptions = {
          method: options.method || 'GET',
          headers,
          timeout: 25000, // Connection timeout
        };

        const req = https.request(url, reqOptions, (res) => {
          clearTimeout(timeoutHandle);
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            const response = {
              ok: res.statusCode! >= 200 && res.statusCode! < 300,
              status: res.statusCode!,
              json: async () => JSON.parse(data),
              text: async () => data,
            } as Response;
            resolve(response);
          });
        });

        req.on('error', (err) => {
          clearTimeout(timeoutHandle);
          reject(err);
        });

        if (options.body) {
          const body = typeof options.body === 'string' ? options.body : String(options.body);
          req.write(body);
        }

        req.end();
      } catch (err) {
        clearTimeout(timeoutHandle);
        reject(err);
      }
    });
  }
}
