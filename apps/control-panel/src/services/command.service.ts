import { Db } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "@hospital-cms/logger";
import { NotFoundError } from "@hospital-cms/errors";
import { signPayload } from "@hospital-cms/crypto-vendor";
import { verifyPayload } from "@hospital-cms/crypto";
import { CP_COLLECTIONS } from "../db";
import type { CommandRecord } from "../types";
import { VendorAuditService } from "./vendor-audit.service";

const logger = createLogger({ module: "CommandService" });

const COMMAND_TTL_SECONDS = 60 * 60; // commands expire in 1 hour if not executed

export class CommandService {
  private readonly audit: VendorAuditService;

  constructor(
    private readonly db: Db,
    private readonly vendorPrivateKey: string,
  ) {
    this.audit = new VendorAuditService(db);
  }

  private col() {
    return this.db.collection<CommandRecord>(CP_COLLECTIONS.COMMANDS);
  }

  async issue(
    instanceId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<CommandRecord> {
    const commandId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + COMMAND_TTL_SECONDS * 1000);

    const commandBody = {
      commandId,
      instanceId,
      type,
      payload,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const signedPayload = signPayload(commandBody, this.vendorPrivateKey, "vendor-key");
    const signature = JSON.stringify(signedPayload);

    const record: CommandRecord = {
      commandId,
      instanceId,
      type,
      payload,
      issuedAt: now,
      expiresAt,
      executedAt: null,
      executionResult: null,
      signature,
    };

    await this.col().insertOne(record as any);
    logger.info({ commandId, instanceId, type }, "Command issued");
    this.audit.log("command.issued", { commandId, type }, instanceId);
    return record;
  }

  async getPendingForInstance(instanceId: string): Promise<CommandRecord[]> {
    return this.col()
      .find({
        instanceId,
        executedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .sort({ issuedAt: 1 })
      .toArray();
  }

  async recordExecution(
    commandId: string,
    instanceId: string,
    result: { success: boolean; message: string },
  ): Promise<void> {
    const cmd = await this.col().findOne({ commandId, instanceId });
    if (!cmd) throw new NotFoundError("Command not found");

    await this.col().updateOne(
      { commandId },
      { $set: { executedAt: new Date(), executionResult: result } },
    );

    logger.info(
      { commandId, instanceId, success: result.success },
      "Command execution recorded",
    );
    this.audit.log("command.executed", { commandId, success: result.success, message: result.message }, instanceId);
  }

  verifyCommandSignature(
    command: CommandRecord,
    vendorPublicKey: string,
  ): boolean {
    const { signature, executedAt, executionResult, _id, ...body } =
      command as any;
    const commandBody = {
      commandId: body.commandId,
      instanceId: body.instanceId,
      type: body.type,
      payload: body.payload,
      issuedAt:
        body.issuedAt instanceof Date
          ? body.issuedAt.toISOString()
          : body.issuedAt,
      expiresAt:
        body.expiresAt instanceof Date
          ? body.expiresAt.toISOString()
          : body.expiresAt,
    };
    try {
      const signedPayload = JSON.parse(signature);
      return verifyPayload(signedPayload, vendorPublicKey);
    } catch {
      return false;
    }
  }

  async listForInstance(
    instanceId: string,
    limit = 50,
  ): Promise<CommandRecord[]> {
    return this.col()
      .find({ instanceId })
      .sort({ issuedAt: -1 })
      .limit(limit)
      .toArray();
  }

  async listRecent(limit = 100): Promise<CommandRecord[]> {
    return this.col()
      .find({})
      .sort({ issuedAt: -1 })
      .limit(limit)
      .toArray();
  }
}
