import { Db } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "@hospital-cms/logger";
import { ConflictError, NotFoundError } from "@hospital-cms/errors";
import { verifyWithPublicKey } from "@hospital-cms/crypto";
import { CP_COLLECTIONS } from "../db";
import type { InstanceRecord, HeartbeatPayload, DesiredState } from "../types";
import { VendorAuditService } from "./vendor-audit.service";

const logger = createLogger({ module: "InstanceService" });

export class InstanceService {
  private readonly audit: VendorAuditService;

  constructor(private readonly db: Db) {
    this.audit = new VendorAuditService(db);
  }

  private col() {
    return this.db.collection<InstanceRecord>(CP_COLLECTIONS.INSTANCES);
  }

  async register(data: {
    hospitalName: string;
    hospitalSlug: string;
    publicKey: string;
    agentVersion: string;
  }): Promise<InstanceRecord> {
    const existing = await this.col().findOne({
      hospitalSlug: data.hospitalSlug,
    });
    if (existing) {
      throw new ConflictError(
        `Instance with slug '${data.hospitalSlug}' already registered`,
      );
    }

    const now = new Date();
    const record: InstanceRecord = {
      instanceId: uuidv4(),
      hospitalName: data.hospitalName,
      hospitalSlug: data.hospitalSlug,
      publicKey: data.publicKey,
      agentVersion: data.agentVersion,
      lastHeartbeatAt: null,
      lastHeartbeatIp: null,
      hardwareFingerprintHash: null,
      backupStatus: null,
      networkQuality: "offline",
      metrics: {
        cpuPercent: 0,
        memoryPercent: 0,
        diskPercent: 0,
        activeEncounters: 0,
        totalPatients: 0,
        uptimeSeconds: 0,
        reportedAt: now,
      },
      desiredState: {
        version: "1",
        plugins: [],
        theme: null,
        config: {},
        updatedAt: now,
      },
      registeredAt: now,
      updatedAt: now,
    };

    await this.col().insertOne(record as any);
    logger.info(
      { instanceId: record.instanceId, slug: data.hospitalSlug },
      "Instance registered",
    );
    this.audit.log("instance.registered", { instanceId: record.instanceId, hospitalName: data.hospitalName, hospitalSlug: data.hospitalSlug, agentVersion: data.agentVersion }, record.instanceId);
    return record;
  }

  async getByInstanceId(instanceId: string): Promise<InstanceRecord> {
    const record = await this.col().findOne({ instanceId });
    if (!record) throw new NotFoundError("Instance not found");
    return record;
  }

  async listAll(): Promise<InstanceRecord[]> {
    return this.col().find({}).sort({ registeredAt: -1 }).toArray();
  }

  async processHeartbeat(
    payload: HeartbeatPayload,
    sourceIp: string,
  ): Promise<DesiredState> {
    const instance = await this.getByInstanceId(payload.instanceId);

    // Verify signature — signs everything except signature field
    // Supports dual-key verification during key rotation grace period
    const { signature, ...unsigned } = payload;
    const signedData = JSON.stringify(unsigned, Object.keys(unsigned).sort());
    let valid = verifyWithPublicKey(
      Buffer.from(signedData),
      signature,
      instance.publicKey,
    );
    if (
      !valid &&
      instance.previousPublicKey &&
      instance.previousPublicKeyExpiresAt &&
      new Date(instance.previousPublicKeyExpiresAt) > new Date()
    ) {
      // Try the previous key during grace period
      valid = verifyWithPublicKey(
        Buffer.from(signedData),
        signature,
        instance.previousPublicKey,
      );
    }
    if (!valid) {
      logger.warn(
        { instanceId: payload.instanceId },
        "Heartbeat signature invalid",
      );
      throw new Error("Invalid heartbeat signature");
    }

    // Check nonce freshness — timestamp within 5 min
    const age = Date.now() - payload.timestamp;
    if (Math.abs(age) > 5 * 60 * 1000) {
      throw new Error("Heartbeat timestamp too far from server time");
    }

    // Nonce replay detection — store nonce, reject duplicates
    const nonceCol = this.db.collection(CP_COLLECTIONS.HEARTBEAT_NONCES);
    try {
      await nonceCol.insertOne({
        nonce: payload.nonce,
        instanceId: payload.instanceId,
        receivedAt: new Date(),
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        // Duplicate nonce — check if from a different instance (state file cloning)
        const existing = await nonceCol.findOne({ nonce: payload.nonce });
        const existingInstanceId = existing?.["instanceId"] as string | undefined;
        if (existing && existingInstanceId !== payload.instanceId) {
          logger.error(
            {
              instanceId: payload.instanceId,
              duplicateOf: existingInstanceId,
              nonce: payload.nonce,
            },
            "NONCE_REPLAY — same nonce used by different instance. Possible state file cloning.",
          );
          this.audit.log(
            "security.nonce_replay_cross_instance",
            {
              instanceId: payload.instanceId,
              duplicateOf: existingInstanceId ?? "unknown",
              nonce: payload.nonce,
              sourceIp,
            },
            payload.instanceId,
          );
        }
        throw new Error("Heartbeat nonce already used — replay rejected");
      }
      // Non-duplicate error — don't block heartbeat, just log
      logger.warn({ err }, "Failed to record heartbeat nonce");
    }

    // Hardware fingerprint detection
    if (payload.hardwareFingerprintHash) {
      if (instance.hardwareFingerprintHash === null) {
        // First heartbeat with fingerprint — store it
        logger.info(
          { instanceId: payload.instanceId, hash: payload.hardwareFingerprintHash.substring(0, 12) },
          "Hardware fingerprint stored (first registration)",
        );
      } else if (payload.hardwareFingerprintHash !== instance.hardwareFingerprintHash) {
        // Fingerprint changed — potential clone or hardware swap
        logger.warn(
          {
            instanceId: payload.instanceId,
            previousHash: instance.hardwareFingerprintHash.substring(0, 12),
            currentHash: payload.hardwareFingerprintHash.substring(0, 12),
          },
          "FINGERPRINT_MISMATCH — hardware fingerprint changed. Possible instance cloning or hardware replacement.",
        );
        this.audit.log(
          "security.fingerprint_mismatch",
          {
            instanceId: payload.instanceId,
            previousHash: instance.hardwareFingerprintHash,
            currentHash: payload.hardwareFingerprintHash,
            sourceIp,
          },
          payload.instanceId,
        );
      }
    }

    const now = new Date();
    await this.col().updateOne(
      { instanceId: payload.instanceId },
      {
        $set: {
          agentVersion: payload.agentVersion,
          lastHeartbeatAt: now,
          lastHeartbeatIp: sourceIp,
          hardwareFingerprintHash: payload.hardwareFingerprintHash ?? instance.hardwareFingerprintHash,
          backupStatus: payload.backupStatus ?? instance.backupStatus,
          networkQuality: payload.networkQuality,
          metrics: { ...payload.metrics, reportedAt: now },
          updatedAt: now,
        },
      },
    );

    // Clock drift detection
    const clockDriftMs = Date.now() - payload.timestamp;
    if (Math.abs(clockDriftMs) > 30_000) {
      logger.warn(
        { instanceId: payload.instanceId, clockDriftMs },
        "CLOCK_DRIFT — instance clock differs from server by more than 30 seconds",
      );
      this.audit.log(
        "security.clock_drift",
        { instanceId: payload.instanceId, clockDriftMs, sourceIp },
        payload.instanceId,
      );
    }

    // Record metric snapshot (includes clock drift for anomaly tracking)
    await this.db.collection(CP_COLLECTIONS.METRICS_HISTORY).insertOne({
      instanceId: payload.instanceId,
      ...payload.metrics,
      clockDriftMs,
      recordedAt: now,
    });

    logger.info(
      {
        instanceId: payload.instanceId,
        networkQuality: payload.networkQuality,
      },
      "Heartbeat processed",
    );

    // Return desired state so agent can reconcile
    const updated = await this.getByInstanceId(payload.instanceId);
    return updated.desiredState;
  }

  async updateDesiredState(
    instanceId: string,
    desiredState: Partial<DesiredState>,
  ): Promise<InstanceRecord> {
    const now = new Date();
    await this.col().updateOne(
      { instanceId },
      {
        $set: {
          "desiredState.plugins": desiredState.plugins ?? [],
          "desiredState.theme": desiredState.theme ?? null,
          "desiredState.config": desiredState.config ?? {},
          "desiredState.version": String(Date.now()),
          "desiredState.updatedAt": now,
          updatedAt: now,
        },
      },
    );
    return this.getByInstanceId(instanceId);
  }

  /**
   * Rotate an instance's public key.
   * The old key is kept for a 24-hour grace period.
   */
  async rotatePublicKey(
    instanceId: string,
    newPublicKey: string,
  ): Promise<void> {
    const instance = await this.getByInstanceId(instanceId);
    const now = new Date();
    const gracePeriodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await this.col().updateOne(
      { instanceId },
      {
        $set: {
          previousPublicKey: instance.publicKey,
          previousPublicKeyExpiresAt: gracePeriodEnd,
          publicKey: newPublicKey,
          updatedAt: now,
        },
      },
    );

    this.audit.log(
      "security.key_rotation",
      { instanceId, gracePeriodEnd: gracePeriodEnd.toISOString() },
      instanceId,
    );
    logger.info({ instanceId }, "Instance public key rotated (24h grace period)");
  }
}
