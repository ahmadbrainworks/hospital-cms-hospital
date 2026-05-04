import type { Db } from "mongodb";
import { generateSecureToken } from "@hospital-cms/crypto";
import { COLLECTIONS } from "@hospital-cms/database";
import type { UserRole } from "@hospital-cms/shared-types";

// SESSION STORE (MongoDB-backed)
// Refresh tokens are stored here to enable revocation.
// TTL index on sessions collection handles expiry cleanup.

export interface SessionDocument {
  _id?: unknown;
  sessionId: string;
  userId: string;
  hospitalId: string;
  role: UserRole;
  refreshTokenHash: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt: Date;
}

function getExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

export class SessionStore {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  private get collection() {
    return this.db.collection<SessionDocument>(COLLECTIONS.SESSIONS);
  }

  async createSession(params: {
    userId: string;
    hospitalId: string;
    role: UserRole;
    refreshTokenHash: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string> {
    const sessionId = generateSecureToken(24);
    const now = new Date();

    const session = {
      sessionId,
      userId: params.userId,
      hospitalId: params.hospitalId,
      role: params.role,
      refreshTokenHash: params.refreshTokenHash,
      createdAt: now,
      expiresAt: getExpiresAt(),
      lastUsedAt: now,
      ...(params.ipAddress !== undefined && { ipAddress: params.ipAddress }),
      ...(params.userAgent !== undefined && { userAgent: params.userAgent }),
    } satisfies Omit<SessionDocument, "_id" | "revokedAt">;

    await this.collection.insertOne(session);

    return sessionId;
  }

  async findSession(sessionId: string): Promise<SessionDocument | null> {
    return this.collection.findOne({
      sessionId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
  }

  async validateRefreshToken(
    sessionId: string,
    refreshTokenHash: string,
  ): Promise<SessionDocument | null> {
    const session = await this.collection.findOne({
      sessionId,
      refreshTokenHash,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });

    if (session) {
      await this.collection.updateOne(
        { sessionId },
        { $set: { lastUsedAt: new Date() } },
      );
    }

    return session;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.collection.updateOne(
      { sessionId },
      { $set: { revokedAt: new Date() } },
    );
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await this.collection.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    return result.modifiedCount;
  }

  async countActiveSessions(userId: string): Promise<number> {
    return this.collection.countDocuments({
      userId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
  }
}
