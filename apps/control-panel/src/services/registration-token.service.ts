/**
 * Registration token service.
 *
 * The vendor pre-issues a single-use registration token before a new hospital
 * deployment. The installer must present this token when calling
 * POST /api/instances/register, preventing unauthorized instance creation.
 *
 * Tokens expire after REGISTRATION_TOKEN_TTL_MS (default: 7 days).
 * They are stored in the `registration_tokens` collection and deleted on use.
 */
import { Db } from "mongodb";
import { randomBytes } from "crypto";
import { createLogger } from "@hospital-cms/logger";
import { NotFoundError } from "@hospital-cms/errors";
import { CP_COLLECTIONS } from "../db";

const logger = createLogger({ module: "RegistrationTokenService" });
const REGISTRATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface RegistrationTokenRecord {
  token: string;
  hospitalName?: string;
  createdAt: Date;
  expiresAt: Date;
}

export class RegistrationTokenService {
  constructor(private readonly db: Db) {}

  private col() {
    return this.db.collection<RegistrationTokenRecord>(
      CP_COLLECTIONS.REGISTRATION_TOKENS,
    );
  }

  /** Issue a new single-use registration token (vendor only). */
  async issue(hospitalName?: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    await this.col().insertOne({
      token,
      hospitalName,
      createdAt: now,
      expiresAt: new Date(now.getTime() + REGISTRATION_TOKEN_TTL_MS),
    });
    logger.info({ hospitalName }, "Registration token issued");
    return token;
  }

  /**
   * Consume a token — validates, then deletes it (single-use).
   * Throws NotFoundError if the token is missing or expired.
   */
  async consume(token: string): Promise<void> {
    const record = await this.col().findOneAndDelete({ token });
    if (!record) {
      throw new NotFoundError("Registration token not found or already used");
    }
    if (new Date() > record.expiresAt) {
      throw new NotFoundError("Registration token has expired");
    }
    logger.info({ hospitalName: record.hospitalName }, "Registration token consumed");
  }

  /**
   * Non-destructive check — confirms the token exists and is not expired
   * without consuming it. Used by the installer's validate-token step.
   */
  async validate(token: string): Promise<{ hospitalName?: string }> {
    const record = await this.col().findOne({ token });
    if (!record) {
      throw new NotFoundError("Registration token not found or already used");
    }
    if (new Date() > record.expiresAt) {
      throw new NotFoundError("Registration token has expired");
    }
    return { hospitalName: record.hospitalName };
  }

  async listActive(): Promise<RegistrationTokenRecord[]> {
    return this.col()
      .find({ expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .toArray();
  }
}
