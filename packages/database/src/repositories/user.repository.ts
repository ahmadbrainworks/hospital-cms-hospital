import { Db, Filter } from "mongodb";
import type { User, UserRole } from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

// USER REPOSITORY

type UserDoc = Omit<User, "_id">;

export class UserRepository extends BaseRepository<User> {
  constructor(db: Db) {
    super(db, COLLECTIONS.USERS, "User");
  }

  async findByEmail(
    hospitalId: string,
    email: string,
  ): Promise<WithStringId<User> | null> {
    return this.findOne({
      hospitalId,
      email: email.toLowerCase(),
      deletedAt: { $exists: false },
    });
  }

  async findByUsername(
    hospitalId: string,
    username: string,
  ): Promise<WithStringId<User> | null> {
    return this.findOne({
      hospitalId,
      username: username.toLowerCase(),
      deletedAt: { $exists: false },
    });
  }

  async findByEmailOrUsername(
    hospitalId: string,
    identifier: string,
  ): Promise<WithStringId<User> | null> {
    return this.findOne({
      hospitalId,
      deletedAt: { $exists: false },
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() },
      ],
    });
  }

  async findActiveByHospital(
    hospitalId: string,
    opts?: { page?: number; limit?: number },
  ) {
    return this.findMany(
      { hospitalId, isActive: true, deletedAt: { $exists: false } },
      opts,
    );
  }

  async findByRole(hospitalId: string, role: UserRole) {
    return this.findMany({
      hospitalId,
      role,
      isActive: true,
      deletedAt: { $exists: false },
    });
  }

  async incrementFailedAttempts(id: string): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      { _id: this.toObjectId(id) },
      {
        $inc: { failedLoginAttempts: 1 },
        $set: { lastFailedLoginAt: new Date(), updatedAt: new Date() },
      },
      { returnDocument: "after" },
    );
    return (
      (result as (UserDoc & { failedLoginAttempts: number }) | null)
        ?.failedLoginAttempts ?? 0
    );
  }

  async resetFailedAttempts(id: string): Promise<void> {
    await this.collection.updateOne(
      { _id: this.toObjectId(id) },
      {
        $set: {
          failedLoginAttempts: 0,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  async lockAccount(id: string, reason: string): Promise<void> {
    await this.collection.updateOne(
      { _id: this.toObjectId(id) },
      {
        $set: {
          isLocked: true,
          lockReason: reason,
          updatedAt: new Date(),
        },
      },
    );
  }

  async unlockAccount(id: string): Promise<void> {
    await this.collection.updateOne(
      { _id: this.toObjectId(id) },
      {
        $set: {
          isLocked: false,
          lockReason: null,
          failedLoginAttempts: 0,
          updatedAt: new Date(),
        },
        $unset: { lockReason: "" },
      },
    );
  }

  async emailExists(hospitalId: string, email: string): Promise<boolean> {
    return this.exists({
      hospitalId,
      email: email.toLowerCase(),
      deletedAt: { $exists: false },
    });
  }

  async usernameExists(hospitalId: string, username: string): Promise<boolean> {
    return this.exists({
      hospitalId,
      username: username.toLowerCase(),
      deletedAt: { $exists: false },
    });
  }
}
