import { Db } from 'mongodb';
import { UserRepository } from '@hospital-cms/database';
import { AuditService } from '@hospital-cms/audit';
import {
  hashPassword,
  validatePasswordStrength,
} from '@hospital-cms/auth';
import { getDefaultPermissionsForRole } from '@hospital-cms/rbac';
import { ConflictError, ValidationError } from '@hospital-cms/errors';
import { AuditAction, UserRole, Permission } from '@hospital-cms/shared-types';
import type { User, UserProfile, PaginatedResult, UserPublic } from '@hospital-cms/shared-types';
import type { WithStringId } from '@hospital-cms/database';

export interface CreateUserParams {
  hospitalId: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  profile: UserProfile;
  permissions?: Permission[];
  actorId: string;
  actorUsername: string;
  actorRole: UserRole;
  traceId: string;
}

export interface UpdateUserParams {
  profile?: Partial<UserProfile>;
  role?: UserRole;
  permissions?: Permission[];
  isActive?: boolean;
}

export class UserService {
  private readonly repo: UserRepository;
  private readonly auditService: AuditService;

  constructor(db: Db) {
    this.repo = new UserRepository(db);
    this.auditService = new AuditService(db);
  }

  private toPublic(user: WithStringId<User>): UserPublic {
    const { passwordHash, mfaSecret, ...pub } = user;
    return pub as UserPublic;
  }

  async createUser(params: CreateUserParams): Promise<UserPublic> {
    const { hospitalId, username, email, password, role, profile } = params;

    // Validate password
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      throw new ValidationError('Password does not meet requirements', {
        errors: strength.errors,
      });
    }

    // Check uniqueness
    const [emailExists, usernameExists] = await Promise.all([
      this.repo.emailExists(hospitalId, email),
      this.repo.usernameExists(hospitalId, username),
    ]);

    if (emailExists) {
      throw new ConflictError(`Email '${email}' is already in use`);
    }
    if (usernameExists) {
      throw new ConflictError(`Username '${username}' is already in use`);
    }

    const passwordHash = await hashPassword(password);
    const defaultPermissions = getDefaultPermissionsForRole(role);

    const user = await this.repo.insertOne({
      hospitalId,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      passwordHash,
      role,
      permissions: params.permissions ?? [],
      isActive: true,
      isLocked: false,
      failedLoginAttempts: 0,
      mfaEnabled: false,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      profile,
    });

    await this.auditService.log({
      hospitalId,
      traceId: params.traceId,
      action: AuditAction.USER_CREATED,
      actor: {
        userId: params.actorId,
        username: params.actorUsername,
        role: params.actorRole,
      },
      resource: { type: 'User', id: user._id, name: user.username },
      outcome: 'SUCCESS',
    });

    return this.toPublic(user);
  }

  async getUser(hospitalId: string, userId: string): Promise<UserPublic> {
    const user = await this.repo.findByIdOrThrow(userId);
    if (user.hospitalId !== hospitalId) {
      // Prevent cross-hospital access
      throw new Error('Not found');
    }
    return this.toPublic(user);
  }

  async listUsers(
    hospitalId: string,
    opts?: { page?: number; limit?: number }
  ): Promise<PaginatedResult<UserPublic>> {
    const result = await this.repo.findActiveByHospital(hospitalId, opts);
    return {
      ...result,
      items: result.items.map(this.toPublic),
    };
  }

  async updateUser(
    hospitalId: string,
    userId: string,
    updates: UpdateUserParams,
    actorId: string,
    actorUsername: string,
    actorRole: UserRole,
    traceId: string
  ): Promise<UserPublic> {
    const before = await this.repo.findByIdOrThrow(userId);

    const updated = await this.repo.updateById(userId, updates as Partial<Omit<User, '_id' | 'createdAt'>>);

    await this.auditService.log({
      hospitalId,
      traceId,
      action: AuditAction.USER_UPDATED,
      actor: { userId: actorId, username: actorUsername, role: actorRole },
      resource: { type: 'User', id: userId },
      changes: {
        before: { role: before.role, isActive: before.isActive },
        after: { role: updated.role, isActive: updated.isActive },
        fields: Object.keys(updates),
      },
      outcome: 'SUCCESS',
    });

    return this.toPublic(updated);
  }

  async deleteUser(
    hospitalId: string,
    userId: string,
    actorId: string,
    actorUsername: string,
    actorRole: UserRole,
    traceId: string
  ): Promise<void> {
    await this.repo.softDeleteById(userId, actorId);

    await this.auditService.log({
      hospitalId,
      traceId,
      action: AuditAction.USER_DELETED,
      actor: { userId: actorId, username: actorUsername, role: actorRole },
      resource: { type: 'User', id: userId },
      outcome: 'SUCCESS',
    });
  }
}
