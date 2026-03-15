import type { Db } from "mongodb";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import type {
  PluginManifest,
  PluginRegistryEntry,
} from "@hospital-cms/shared-types";
import { PluginStatus } from "@hospital-cms/shared-types";
import { PluginRepository } from "@hospital-cms/database";
import {
  validateManifestSchema,
  verifyManifestSignature,
} from "./manifest-validator";
import { createPluginSandbox, type PluginApi } from "./sandbox";
import { globalEventBus } from "./event-bus";
import {
  PluginSignatureError,
  NotFoundError,
  InternalError,
} from "@hospital-cms/errors";
import { logger } from "@hospital-cms/logger";

// PLUGIN REGISTRY
// Central registry of loaded plugin modules.
// Handles install → activate → deactivate → uninstall lifecycle.

const log = logger("plugin:registry");

export interface LoadedPlugin {
  manifest: PluginManifest;
  api: PluginApi;
  // Express Router returned by plugin's activate() call
  router?: unknown;
}

export class PluginRegistry {
  private readonly loaded = new Map<string, LoadedPlugin>();
  private readonly repo: PluginRepository;
  private readonly db: Db;
  private readonly storagePath: string;
  private readonly vendorPublicKey: string;

  constructor(db: Db, storagePath: string, vendorPublicKey: string) {
    this.repo = new PluginRepository(db);
    this.db = db;
    this.storagePath = storagePath;
    this.vendorPublicKey = vendorPublicKey;
    mkdirSync(storagePath, { recursive: true });
  }

  async listPlugins(hospitalId: string) {
    return this.repo.findMany({ hospitalId });
  }

  //  Install a plugin from a manifest + file path
  async install(params: {
    hospitalId: string;
    manifest: unknown;
    pluginFilePath: string;
    actorId: string;
  }): Promise<PluginRegistryEntry & { _id: string }> {
    // 1. Validate manifest schema
    const validated = validateManifestSchema(params.manifest);
    const manifest = validated as PluginManifest & { sha256?: string };

    // 2. Verify vendor signature
    verifyManifestSignature(manifest, this.vendorPublicKey);

    // 3. Verify file hash matches manifest (if hash is declared)
    await this.verifyFileIntegrity(params.pluginFilePath, manifest);

    // 4. Store plugin file in local plugin storage
    const destDir = join(this.storagePath, manifest.pluginId, manifest.version);
    mkdirSync(destDir, { recursive: true });

    const entry = await this.repo.upsertPlugin(
      params.hospitalId,
      manifest.pluginId,
      {
        name: manifest.name,
        version: manifest.version,
        status: PluginStatus.INSTALLED,
        manifest,
        installedAt: new Date(),
        installedBy: params.actorId,
        installPath: destDir,
      },
    );

    log.info(
      { pluginId: manifest.pluginId, version: manifest.version },
      "Plugin installed",
    );
    return entry as PluginRegistryEntry & { _id: string };
  }

  //  Activate a plugin
  async activate(hospitalId: string, pluginId: string): Promise<void> {
    const entry = await this.repo.findByPluginId(hospitalId, pluginId);
    if (!entry) throw new NotFoundError("Plugin", pluginId);

    if (this.loaded.has(pluginId)) {
      log.warn({ pluginId }, "Plugin already active");
      return;
    }

    try {
      const sandbox = createPluginSandbox(entry.manifest, this.db, hospitalId);

      // Load the plugin module dynamically
      let router: unknown;
      if (
        entry.installPath &&
        existsSync(join(entry.installPath, entry.manifest.entryPoint))
      ) {
        const pluginModule = await import(
          join(entry.installPath, entry.manifest.entryPoint)
        );

        // Plugin must export activate(api) → router
        if (typeof pluginModule["activate"] === "function") {
          router = await pluginModule["activate"](sandbox);
        }

        // Register event subscriptions declared in manifest
        for (const event of entry.manifest.events) {
          if (typeof pluginModule["on" + event] === "function") {
            globalEventBus.subscribe(
              pluginId,
              event,
              pluginModule["on" + event],
            );
          }
        }
      }

      this.loaded.set(pluginId, {
        manifest: entry.manifest,
        api: sandbox,
        router,
      });

      await this.repo.upsertPlugin(hospitalId, pluginId, {
        status: PluginStatus.ACTIVE,
        activatedAt: new Date(),
      });

      log.info({ pluginId }, "Plugin activated");
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.repo.upsertPlugin(hospitalId, pluginId, {
        status: PluginStatus.FAILED,
        lastError: error,
      });
      log.error({ err, pluginId }, "Plugin activation failed");
      throw new InternalError(
        `Plugin '${pluginId}' failed to activate: ${error}`,
      );
    }
  }

  //  Deactivate a plugin
  async deactivate(hospitalId: string, pluginId: string): Promise<void> {
    const plugin = this.loaded.get(pluginId);
    if (!plugin) return;

    globalEventBus.unsubscribeAll(pluginId);
    this.loaded.delete(pluginId);

    await this.repo.upsertPlugin(hospitalId, pluginId, {
      status: PluginStatus.DISABLED,
    });

    log.info({ pluginId }, "Plugin deactivated");
  }

  //  Get loaded plugin
  getLoaded(pluginId: string): LoadedPlugin | undefined {
    return this.loaded.get(pluginId);
  }

  getAllLoaded(): LoadedPlugin[] {
    return Array.from(this.loaded.values());
  }

  isActive(pluginId: string): boolean {
    return this.loaded.has(pluginId);
  }

  //  Restore active plugins on server startup
  async restoreActivePlugins(hospitalId: string): Promise<void> {
    const result = await this.repo.findActive(hospitalId);
    for (const entry of result.items) {
      try {
        await this.activate(hospitalId, entry.pluginId);
      } catch (err) {
        log.error(
          { err, pluginId: entry.pluginId },
          "Failed to restore plugin on startup",
        );
      }
    }
    log.info({ count: result.items.length }, "Plugin restore complete");
  }

  private async verifyFileIntegrity(
    filePath: string,
    manifest: PluginManifest & { sha256?: string },
  ): Promise<void> {
    if (!manifest["sha256"] || !existsSync(filePath)) return;

    const hash = await new Promise<string>((resolve, reject) => {
      const h = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (d) => h.update(d));
      stream.on("end", () => resolve(h.digest("hex")));
      stream.on("error", reject);
    });

    if (hash !== manifest["sha256"]) {
      throw new PluginSignatureError(manifest.pluginId);
    }
  }
}
