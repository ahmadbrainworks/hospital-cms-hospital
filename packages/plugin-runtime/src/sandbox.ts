import type { Db } from "mongodb";
import type { PluginManifest } from "@hospital-cms/shared-types";
import { Permission } from "@hospital-cms/shared-types";
import { ForbiddenError } from "@hospital-cms/errors";
import { logger } from "@hospital-cms/logger";

// PLUGIN SANDBOX
// Provides a controlled API surface to plugins.
// Plugins cannot access the DB directly; they call scoped methods.
// Plugins cannot call permissions they don't declare in manifest.

const log = logger("plugin:sandbox");

export interface PluginStorageApi {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PluginApi {
  pluginId: string;
  storage: PluginStorageApi;
  log: {
    info(msg: string, ctx?: Record<string, unknown>): void;
    warn(msg: string, ctx?: Record<string, unknown>): void;
    error(msg: string, ctx?: Record<string, unknown>): void;
  };
  assertPermission(permission: Permission): void;
}

export function createPluginSandbox(
  manifest: PluginManifest,
  db: Db,
  hospitalId: string,
): PluginApi {
  const allowedPermissions = new Set(manifest.permissions);
  const storageCollection = db.collection("plugin_storage");
  const pluginLog = logger(`plugin:${manifest.pluginId}`);

  const storage: PluginStorageApi = {
    async get(key: string): Promise<unknown> {
      const doc = await storageCollection.findOne({
        pluginId: manifest.pluginId,
        hospitalId,
        key,
      });
      return doc?.["value"] ?? null;
    },

    async set(key: string, value: unknown): Promise<void> {
      await storageCollection.updateOne(
        { pluginId: manifest.pluginId, hospitalId, key },
        {
          $set: { value, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
    },

    async delete(key: string): Promise<void> {
      await storageCollection.deleteOne({
        pluginId: manifest.pluginId,
        hospitalId,
        key,
      });
    },
  };

  return {
    pluginId: manifest.pluginId,
    storage,

    log: {
      info: (msg, ctx) => pluginLog.info(ctx ?? {}, msg),
      warn: (msg, ctx) => pluginLog.warn(ctx ?? {}, msg),
      error: (msg, ctx) => pluginLog.error(ctx ?? {}, msg),
    },

    assertPermission(permission: Permission): void {
      if (!allowedPermissions.has(permission)) {
        log.warn(
          { pluginId: manifest.pluginId, attempted: permission },
          "Plugin attempted undeclared permission — blocked",
        );
        throw new ForbiddenError(
          `Plugin '${manifest.pluginId}' did not declare permission '${permission}' in its manifest.`,
        );
      }
    },
  };
}
