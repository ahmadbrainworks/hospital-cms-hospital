/**
 * Staff session store for vendor control panel.
 *
 * Stores refresh token hashes in cp_staff_sessions so sessions can be
 * revoked individually or en masse (e.g. on password reset).
 */
import { Db } from "mongodb";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { createLogger } from "@hospital-cms/logger";
import { CP_COLLECTIONS } from "../db";
import type { StaffSessionDocument } from "../types/vendor-auth";

const logger = createLogger({ module: "StaffSessionStore" });

/** Hash a refresh token for storage (we never store the raw token). */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class StaffSessionStore {
  constructor(private readonly db: Db) {}

  private col() {
    return this.db.collection<StaffSessionDocument>(
      CP_COLLECTIONS.STAFF_SESSIONS,
    );
  }

  async createSession(params: {
    staffId: string;
    refreshTokenHash: string;
    ipAddress: string;
    userAgent: string;
    expiresAt: Date;
  }): Promise<string> {
    const sessionId = randomUUID();
    const now = new Date();

    await this.col().insertOne({
      sessionId,
      staffId: params.staffId,
      refreshTokenHash: params.refreshTokenHash,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      createdAt: now,
      expiresAt: params.expiresAt,
      lastUsedAt: now,
    } as StaffSessionDocument);

    logger.debug({ sessionId, staffId: params.staffId }, "Session created");
    return sessionId;
  }

  async findSession(sessionId: string): Promise<StaffSessionDocument | null> {
    return this.col().findOne({
      sessionId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
  }

  async validateRefreshToken(
    sessionId: string,
    refreshTokenHash: string,
  ): Promise<StaffSessionDocument | null> {
    const session = await this.findSession(sessionId);
    if (!session) return null;
    if (session.refreshTokenHash !== refreshTokenHash) return null;

    // Update last used timestamp
    await this.col().updateOne(
      { sessionId },
      { $set: { lastUsedAt: new Date() } },
    );

    return session;
  }

  /** Rotate the refresh token hash for a session (token rotation). */
  async rotateRefreshToken(
    sessionId: string,
    newRefreshTokenHash: string,
  ): Promise<void> {
    await this.col().updateOne(
      { sessionId },
      {
        $set: {
          refreshTokenHash: newRefreshTokenHash,
          lastUsedAt: new Date(),
        },
      },
    );
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.col().updateOne(
      { sessionId },
      { $set: { revokedAt: new Date() } },
    );
    logger.debug({ sessionId }, "Session revoked");
  }

  async revokeAllStaffSessions(staffId: string): Promise<number> {
    const result = await this.col().updateMany(
      { staffId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    logger.info(
      { staffId, count: result.modifiedCount },
      "All staff sessions revoked",
    );
    return result.modifiedCount;
  }

  async countActiveSessions(staffId: string): Promise<number> {
    return this.col().countDocuments({
      staffId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
  }

  async listStaffSessions(
    staffId: string,
  ): Promise<StaffSessionDocument[]> {
    return this.col()
      .find({
        staffId,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .sort({ lastUsedAt: -1 })
      .toArray();
  }
}
