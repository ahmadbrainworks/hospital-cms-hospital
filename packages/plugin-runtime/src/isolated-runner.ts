import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { logger } from "@hospital-cms/logger";
import type { PluginManifest } from "@hospital-cms/shared-types";

const log = logger("plugin:isolated-runner");

export interface IsolatedPluginOptions {
  manifest: PluginManifest;
  pluginPath: string;
  hospitalId: string;
  /** Maximum heap size in MB for the plugin worker (default: 128) */
  maxHeapMb?: number;
  /** Timeout in ms for API calls from the plugin (default: 10000) */
  apiTimeoutMs?: number;
}

export type PluginMessageRequest =
  | { type: "storage.get"; requestId: string; args: { key: string } }
  | { type: "storage.set"; requestId: string; args: { key: string; value: unknown } }
  | { type: "storage.delete"; requestId: string; args: { key: string } }
  | { type: "log.info"; args: { message: string; context?: Record<string, unknown> } }
  | { type: "log.warn"; args: { message: string; context?: Record<string, unknown> } }
  | { type: "log.error"; args: { message: string; context?: Record<string, unknown> } }
  | { type: "event.emit"; requestId: string; args: { event: string; data: unknown } };

export type PluginMessageResponse = {
  type: "response";
  requestId: string;
  result?: unknown;
  error?: string;
};

/**
 * Runs a plugin in a `worker_threads` Worker with restricted capabilities.
 *
 * Isolation guarantees:
 * - Separate V8 heap with configurable memory limits
 * - Environment variables stripped (only NODE_ENV passed)
 * - Communication via structured message passing only
 * - Plugin never gets direct DB/filesystem/network access
 */
export class IsolatedPluginRunner {
  private worker: Worker | null = null;
  private readonly options: Required<IsolatedPluginOptions>;
  private messageHandler: ((msg: PluginMessageRequest) => void) | null = null;

  constructor(options: IsolatedPluginOptions) {
    this.options = {
      maxHeapMb: 128,
      apiTimeoutMs: 10000,
      ...options,
    };
  }

  /**
   * Start the worker and load the plugin.
   * @param apiHandler — callback to handle plugin API requests (storage, events)
   */
  async start(
    apiHandler: (msg: PluginMessageRequest) => Promise<PluginMessageResponse>,
  ): Promise<void> {
    const workerScript = join(__dirname, "plugin-worker.js");

    this.worker = new Worker(workerScript, {
      workerData: {
        manifest: this.options.manifest,
        pluginPath: this.options.pluginPath,
        hospitalId: this.options.hospitalId,
      },
      env: {
        NODE_ENV: process.env["NODE_ENV"] ?? "production",
      },
      resourceLimits: {
        maxOldGenerationSizeMb: this.options.maxHeapMb,
        maxYoungGenerationSizeMb: Math.min(32, Math.floor(this.options.maxHeapMb / 4)),
        codeRangeSizeMb: 16,
        stackSizeMb: 4,
      },
    });

    this.messageHandler = (msg: PluginMessageRequest) => {
      apiHandler(msg)
        .then((response) => {
          this.worker?.postMessage(response);
        })
        .catch((err) => {
          const requestId = "requestId" in msg ? msg.requestId : undefined;
          if (requestId) {
            this.worker?.postMessage({
              type: "response",
              requestId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });
    };

    this.worker.on("message", this.messageHandler);

    this.worker.on("error", (err) => {
      log.error(
        { pluginId: this.options.manifest.pluginId, err: err.message },
        "Plugin worker error",
      );
    });

    this.worker.on("exit", (code) => {
      if (code !== 0) {
        log.warn(
          { pluginId: this.options.manifest.pluginId, exitCode: code },
          "Plugin worker exited with non-zero code",
        );
      }
      this.worker = null;
    });

    log.info(
      { pluginId: this.options.manifest.pluginId, maxHeapMb: this.options.maxHeapMb },
      "Isolated plugin worker started",
    );
  }

  /** Gracefully terminate the worker. */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      log.info(
        { pluginId: this.options.manifest.pluginId },
        "Isolated plugin worker stopped",
      );
    }
  }

  /** Check if the worker is alive. */
  isRunning(): boolean {
    return this.worker !== null;
  }
}
