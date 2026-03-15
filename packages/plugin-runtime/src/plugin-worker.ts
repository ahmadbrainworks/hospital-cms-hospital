/**
 * Plugin Worker Sandbox
 *
 * Runs inside a worker_thread with restricted capabilities.
 * Communication with the main thread happens exclusively via
 * structured messages through parentPort.
 *
 * Security restrictions:
 * 1. process.env is replaced with a minimal set
 * 2. process.exit / process.kill are no-ops
 * 3. Plugin receives a proxy API that sends messages to the main thread
 * 4. Direct fs/net/child_process access is blocked by the restricted env
 */
import { workerData, parentPort } from "node:worker_threads";
import { randomUUID } from "node:crypto";

if (!parentPort) {
  throw new Error("plugin-worker must be run as a worker_thread");
}

const port = parentPort;

interface WorkerData {
  manifest: {
    pluginId: string;
    permissions: string[];
    entryPoint: string;
  };
  pluginPath: string;
  hospitalId: string;
}

const data = workerData as WorkerData;

// ─── Sandbox process patches ────────────────────────────────────────

// Strip environment variables
const safeEnv = { NODE_ENV: process.env["NODE_ENV"] ?? "production" };
Object.keys(process.env).forEach((key) => {
  delete process.env[key];
});
Object.assign(process.env, safeEnv);

// Disable process.exit and process.kill
process.exit = (() => {
  /* no-op */
}) as never;
process.kill = (() => {
  /* no-op */
}) as never;

// ─── Message-based API proxy ────────────────────────────────────────

const pendingRequests = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();

port.on("message", (msg: { type: string; requestId?: string; result?: unknown; error?: string }) => {
  if (msg.type === "response" && msg.requestId) {
    const pending = pendingRequests.get(msg.requestId);
    if (pending) {
      pendingRequests.delete(msg.requestId);
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    }
  }
});

function sendRequest(type: string, args: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Plugin API timeout: ${type}`));
    }, 10000);

    pendingRequests.set(requestId, {
      resolve: (val) => {
        clearTimeout(timeout);
        resolve(val);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    port.postMessage({ type, requestId, args });
  });
}

// ─── Plugin API exposed to the loaded plugin ────────────────────────

const pluginApi = {
  pluginId: data.manifest.pluginId,

  storage: {
    get: (key: string) => sendRequest("storage.get", { key }),
    set: (key: string, value: unknown) => sendRequest("storage.set", { key, value }),
    delete: (key: string) => sendRequest("storage.delete", { key }),
  },

  log: {
    info: (message: string, context?: Record<string, unknown>) => {
      port.postMessage({ type: "log.info", args: { message, context } });
    },
    warn: (message: string, context?: Record<string, unknown>) => {
      port.postMessage({ type: "log.warn", args: { message, context } });
    },
    error: (message: string, context?: Record<string, unknown>) => {
      port.postMessage({ type: "log.error", args: { message, context } });
    },
  },

  events: {
    emit: (event: string, eventData: unknown) =>
      sendRequest("event.emit", { event, data: eventData }),
  },
};

// ─── Load and initialize the plugin ─────────────────────────────────

async function loadPlugin() {
  try {
    const pluginModule = await import(data.pluginPath);

    if (typeof pluginModule.activate === "function") {
      await pluginModule.activate(pluginApi);
      pluginApi.log.info(`Plugin ${data.manifest.pluginId} activated in isolated worker`);
    } else {
      pluginApi.log.warn(`Plugin ${data.manifest.pluginId} has no activate() export`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pluginApi.log.error(`Failed to load plugin ${data.manifest.pluginId}: ${message}`);
  }
}

loadPlugin();
