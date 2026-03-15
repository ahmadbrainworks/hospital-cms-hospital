/**
 * Staff management service.
 *
 * CRUD operations for vendor staff accounts. Passwords are hashed with
 * bcryptjs. All mutations are audit-logged.
 */
import { Db } from "mongodb";
import { randomUUID } from "crypto";
import { hash, compare } from "bcryptjs";
import { createLogger } from "@hospital-cms/logger";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@hospital-cms/errors";
import { CP_COLLECTIONS } from "../db";
import {
  VendorRole,
  VendorStaffStatus,
  type StaffDocument,
  type StaffPublic,
} from "../types/vendor-auth";
import { StaffAuditService } from "./staff-audit.service";

const logger = createLogger({ module: "StaffService" });

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

function toPublic(doc: StaffDocument): StaffPublic {
  const { passwordHash: _pw, _id: _id, ...rest } = doc;
  return rest;
}

export class StaffService {
  private readonly audit: StaffAuditService;

  constructor(private readonly db: Db) {
    this.audit = new StaffAuditService(db);
  }

  private col() {
    return this.db.collection<StaffDocument>(CP_COLLECTIONS.STAFF);
  }

  async createStaff(params: {
    email: string;
    username: string;
    displayName: string;
    password: string;
    role: VendorRole;
    createdBy: string;
    ipAddress?: string;
  }): Promise<StaffPublic> {
    // Validate password
    if (params.password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    // Check for duplicate email/username
    const existing = await this.col().findOne({
      $or: [{ email: params.email }, { username: params.username }],
    });
    if (existing) {
      if (existing.email === params.email) {
        throw new ConflictError("A staff account with this email already exists");
      }
      throw new ConflictError("A staff account with this username already exists");
    }

    const now = new Date();
    const doc: StaffDocument = {
      staffId: randomUUID(),
      email: params.email.toLowerCase().trim(),
      username: params.username.toLowerCase().trim(),
      displayName: params.displayName.trim(),
      passwordHash: await hash(params.password, BCRYPT_ROUNDS),
      role: params.role,
      status: VendorStaffStatus.ACTIVE,
      failedLoginAttempts: 0,
      lastLoginAt: null,
      lastLoginIp: null,
      createdAt: now,
      updatedAt: now,
      createdBy: params.createdBy,
    };

    await this.col().insertOne(doc as any);
    logger.info(
      { staffId: doc.staffId, email: doc.email, role: doc.role },
      "Staff account created",
    );

    this.audit.log(
      params.createdBy,
      "system",
      "staff.created",
      {
        staffId: doc.staffId,
        email: doc.email,
        role: doc.role,
      },
      params.ipAddress ?? "system",
    );

    return toPublic(doc);
  }

  async listStaff(): Promise<StaffPublic[]> {
    const docs = await this.col()
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(toPublic);
  }

  async getStaffById(staffId: string): Promise<StaffPublic> {
    const doc = await this.col().findOne({ staffId });
    if (!doc) throw new NotFoundError("Staff member not found");
    return toPublic(doc);
  }

  /** Internal — returns full document including passwordHash. */
  async _getStaffByEmail(email: string): Promise<StaffDocument | null> {
    return this.col().findOne({ email: email.toLowerCase().trim() });
  }

  async updateStaff(
    staffId: string,
    updates: {
      displayName?: string;
      role?: VendorRole;
      status?: VendorStaffStatus;
    },
    updatedBy: string,
    ipAddress: string,
  ): Promise<StaffPublic> {
    const existing = await this.col().findOne({ staffId });
    if (!existing) throw new NotFoundError("Staff member not found");

    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.displayName !== undefined) {
      $set["displayName"] = updates.displayName.trim();
    }
    if (updates.role !== undefined) $set["role"] = updates.role;
    if (updates.status !== undefined) {
      $set["status"] = updates.status;
      if (updates.status === VendorStaffStatus.ACTIVE) {
        $set["failedLoginAttempts"] = 0;
      }
    }

    await this.col().updateOne({ staffId }, { $set });

    this.audit.log(updatedBy, "system", "staff.updated", {
      staffId,
      changes: updates,
    }, ipAddress);

    return this.getStaffById(staffId);
  }

  async resetPassword(
    staffId: string,
    newPassword: string,
    resetBy: string,
    ipAddress: string,
  ): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    const existing = await this.col().findOne({ staffId });
    if (!existing) throw new NotFoundError("Staff member not found");

    await this.col().updateOne(
      { staffId },
      {
        $set: {
          passwordHash: await hash(newPassword, BCRYPT_ROUNDS),
          failedLoginAttempts: 0,
          updatedAt: new Date(),
        },
      },
    );

    logger.info({ staffId }, "Staff password reset by admin");
    this.audit.log(resetBy, "system", "staff.password_reset", { staffId }, ipAddress);
  }

  async unlockStaff(
    staffId: string,
    unlockedBy: string,
    ipAddress: string,
  ): Promise<void> {
    const existing = await this.col().findOne({ staffId });
    if (!existing) throw new NotFoundError("Staff member not found");

    await this.col().updateOne(
      { staffId },
      {
        $set: {
          status: VendorStaffStatus.ACTIVE,
          failedLoginAttempts: 0,
          updatedAt: new Date(),
        },
      },
    );

    logger.info({ staffId }, "Staff account unlocked");
    this.audit.log(unlockedBy, "system", "staff.unlocked", { staffId }, ipAddress);
  }

  /** Record a failed login attempt; lock after 5. */
  async recordFailedLogin(email: string): Promise<void> {
    const result = await this.col().findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { $inc: { failedLoginAttempts: 1 } },
      { returnDocument: "after" },
    );

    if (result && result.failedLoginAttempts >= 5) {
      await this.col().updateOne(
        { email: email.toLowerCase().trim() },
        { $set: { status: VendorStaffStatus.LOCKED, updatedAt: new Date() } },
      );
      logger.warn({ email }, "Staff account locked after 5 failed attempts");
    }
  }

  /** Record a successful login. */
  async recordSuccessfulLogin(
    staffId: string,
    ipAddress: string,
  ): Promise<void> {
    await this.col().updateOne(
      { staffId },
      {
        $set: {
          failedLoginAttempts: 0,
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
          updatedAt: new Date(),
        },
      },
    );
  }

  /** Verify a password against the stored hash. */
  async verifyPassword(
    passwordHash: string,
    candidate: string,
  ): Promise<boolean> {
    return compare(candidate, passwordHash);
  }

  /** Count total staff (used for seed check). */
  async countStaff(): Promise<number> {
    return this.col().countDocuments();
  }
}
