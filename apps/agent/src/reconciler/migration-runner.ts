import { Db } from "mongodb";
import { join } from "node:path";
import { createLogger } from "@hospital-cms/logger";
import type { PackageMigration } from "@hospital-cms/contracts";

const logger = createLogger({ module: "MigrationRunner" });

const COLLECTION = "package_migrations";

export interface MigrationRecord {
  packageId: string;
  migrationId: string;
  version: string;
  direction: "up" | "down";
  status: "pending" | "running" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  durationMs?: number;
}

export interface MigrationResult {
  migrationId: string;
  direction: "up" | "down";
  success: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Runs database migrations bundled with plugin packages.
 * Migrations are idempotent — running the same migration twice is safe
 * because we track applied migrations in the `package_migrations` collection.
 */
export class MigrationRunner {
  constructor(
    private readonly db: Db,
    private readonly packagesDir: string,
  ) {}

  /**
   * Runs all pending "up" migrations for a package upgrade.
   * Returns results for each migration attempted.
   */
  async runUpMigrations(
    packageId: string,
    fromVersion: string | null,
    toVersion: string,
    migrations: PackageMigration[],
    installPath: string,
  ): Promise<MigrationResult[]> {
    // Get already-applied migrations
    const applied = await this.getAppliedMigrations(packageId);
    const appliedIds = new Set(applied.map((r) => r.migrationId));

    // Filter to pending migrations, sorted by version
    const pending = migrations
      .filter((m) => !appliedIds.has(m.migrationId))
      .sort((a, b) => a.migrationId.localeCompare(b.migrationId));

    if (pending.length === 0) {
      logger.info({ packageId, toVersion }, "No pending migrations");
      return [];
    }

    logger.info(
      { packageId, fromVersion, toVersion, count: pending.length },
      "Running up migrations",
    );

    const results: MigrationResult[] = [];

    for (const migration of pending) {
      const result = await this.runSingleMigration(
        packageId,
        migration,
        "up",
        installPath,
      );
      results.push(result);

      if (!result.success) {
        logger.error(
          { packageId, migrationId: migration.migrationId, error: result.error },
          "Migration failed — aborting remaining migrations",
        );
        break;
      }
    }

    return results;
  }

  /**
   * Runs "down" migrations for a rollback (best-effort).
   */
  async runDownMigrations(
    packageId: string,
    fromVersion: string,
    toVersion: string,
    migrations: PackageMigration[],
    installPath: string,
  ): Promise<MigrationResult[]> {
    // Get applied migrations to know which to roll back
    const applied = await this.getAppliedMigrations(packageId);
    const appliedIds = new Set(applied.map((r) => r.migrationId));

    // Only roll back migrations that were actually applied, in reverse order
    const toRollback = migrations
      .filter((m) => appliedIds.has(m.migrationId))
      .sort((a, b) => b.migrationId.localeCompare(a.migrationId));

    if (toRollback.length === 0) {
      return [];
    }

    logger.info(
      { packageId, fromVersion, toVersion, count: toRollback.length },
      "Running down migrations (rollback)",
    );

    const results: MigrationResult[] = [];

    for (const migration of toRollback) {
      const result = await this.runSingleMigration(
        packageId,
        migration,
        "down",
        installPath,
      );
      results.push(result);

      if (!result.success) {
        logger.error(
          { packageId, migrationId: migration.migrationId, error: result.error },
          "Rollback migration failed — continuing with remaining (best-effort)",
        );
      }
    }

    return results;
  }

  private async runSingleMigration(
    packageId: string,
    migration: PackageMigration,
    direction: "up" | "down",
    installPath: string,
  ): Promise<MigrationResult> {
    const startedAt = new Date();

    // Record as running
    const record: MigrationRecord = {
      packageId,
      migrationId: migration.migrationId,
      version: migration.version,
      direction,
      status: "running",
      startedAt,
    };
    await this.col().insertOne(record as any);

    try {
      // Load the migration script
      const scriptFullPath = join(installPath, migration.scriptPath);
      const mod = await import(scriptFullPath);
      const fn = direction === "up" ? mod.up : mod.down;

      if (typeof fn !== "function") {
        throw new Error(
          `Migration ${migration.migrationId} does not export ${direction}()`,
        );
      }

      // Execute migration
      await fn(this.db);

      const durationMs = Date.now() - startedAt.getTime();

      // Mark completed
      await this.col().updateOne(
        { packageId, migrationId: migration.migrationId, direction },
        {
          $set: {
            status: "completed",
            completedAt: new Date(),
            durationMs,
          },
        },
      );

      logger.info(
        { packageId, migrationId: migration.migrationId, direction, durationMs },
        "Migration completed",
      );

      return { migrationId: migration.migrationId, direction, success: true, durationMs };
    } catch (err) {
      const durationMs = Date.now() - startedAt.getTime();
      const error = err instanceof Error ? err.message : String(err);

      await this.col().updateOne(
        { packageId, migrationId: migration.migrationId, direction },
        {
          $set: {
            status: "failed",
            completedAt: new Date(),
            durationMs,
            error,
          },
        },
      );

      return { migrationId: migration.migrationId, direction, success: false, durationMs, error };
    }
  }

  private async getAppliedMigrations(packageId: string): Promise<MigrationRecord[]> {
    return this.col()
      .find({ packageId, direction: "up", status: "completed" })
      .toArray() as unknown as MigrationRecord[];
  }

  private col() {
    return this.db.collection(COLLECTION);
  }
}
