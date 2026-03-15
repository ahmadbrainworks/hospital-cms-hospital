import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import {
  DEFAULT_LOCK_FILE,
  DEFAULT_PRIVATE_KEY_PATH,
  DEFAULT_STATE_FILE,
  DEFAULT_PACKAGES_DIR,
  VENDOR_CP_API_URL,
  EMBEDDED_VENDOR_PUBLIC_KEY,
} from "../paths";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  CONTROL_PANEL_URL: z.string().url().default(VENDOR_CP_API_URL),
  INSTANCE_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
  /** RSA-4096 instance private key (PEM) — signs heartbeat payloads */
  AGENT_PRIVATE_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(100).optional()),
  /** RSA-4096 vendor public key (PEM) — verifies signed commands/licenses.
   *  Resolved from env, or falls back to the installer lock file (vendorPublicKey). */
  VENDOR_PUBLIC_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(100).optional()),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(10000).default(30000),
  AGENT_VERSION: z.string().default("1.0.0"),
  STATE_FILE_PATH: z
    .string()
    .default(DEFAULT_STATE_FILE),
  PACKAGES_DIR: z
    .string()
    .default(DEFAULT_PACKAGES_DIR),
  /** Hospital API base URL for agent-side config pushes */
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  API_ADMIN_TOKEN: z.string().optional(),
  /** Path to persist the private key — required for key rotation support */
  AGENT_PRIVATE_KEY_PATH: z
    .string()
    .default(DEFAULT_PRIVATE_KEY_PATH),
  INSTALLER_LOCK_FILE: z
    .string()
    .default(DEFAULT_LOCK_FILE),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug", "trace"]).default("info"),
});

type AgentConfigInput = z.infer<typeof schema>;
export type AgentConfig = Omit<AgentConfigInput, "INSTANCE_ID" | "AGENT_PRIVATE_KEY" | "VENDOR_PUBLIC_KEY"> & {
  INSTANCE_ID: string;
  AGENT_PRIVATE_KEY: string;
  VENDOR_PUBLIC_KEY: string;
};

let _config: AgentConfig | null = null;

interface LockFileData {
  instanceId?: string;
  vendorPublicKey?: string;
}

function readLockFile(lockFilePath: string): LockFileData | undefined {
  if (!existsSync(lockFilePath)) return undefined;

  try {
    return JSON.parse(readFileSync(lockFilePath, "utf-8")) as LockFileData;
  } catch {
    return undefined;
  }
}

function readPrivateKeyFromPath(path?: string): string | undefined {
  if (!path || !existsSync(path)) return undefined;

  try {
    const key = readFileSync(path, "utf-8").trim();
    return key.length > 0 ? key : undefined;
  } catch {
    return undefined;
  }
}

export function getAgentConfig(): AgentConfig {
  if (!_config) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      const formatted = result.error.errors
        .map((e) => `  ${e.path.join(".")}: ${e.message}`)
        .join("\n");
      throw new Error(`Agent config validation failed:\n${formatted}`);
    }

    const lockFile = readLockFile(result.data.INSTALLER_LOCK_FILE);

    const resolvedInstanceId =
      result.data.INSTANCE_ID
      ?? lockFile?.instanceId;
    if (!resolvedInstanceId) {
      throw new Error(
        "Agent config validation failed:\n" +
        "  INSTANCE_ID: set INSTANCE_ID or provide INSTALLER_LOCK_FILE with an installed instance",
      );
    }

    const resolvedPrivateKey =
      result.data.AGENT_PRIVATE_KEY
      ?? readPrivateKeyFromPath(result.data.AGENT_PRIVATE_KEY_PATH);
    if (!resolvedPrivateKey) {
      throw new Error(
        "Agent config validation failed:\n" +
        "  AGENT_PRIVATE_KEY: set AGENT_PRIVATE_KEY or provide AGENT_PRIVATE_KEY_PATH pointing to the installed instance key",
      );
    }

    const resolvedVendorKey =
      result.data.VENDOR_PUBLIC_KEY
      ?? lockFile?.vendorPublicKey
      ?? EMBEDDED_VENDOR_PUBLIC_KEY;

    process.env["INSTANCE_ID"] ??= resolvedInstanceId;
    process.env["AGENT_PRIVATE_KEY"] ??= resolvedPrivateKey;
    process.env["VENDOR_PUBLIC_KEY"] ??= resolvedVendorKey;

    _config = {
      ...result.data,
      INSTANCE_ID: resolvedInstanceId,
      AGENT_PRIVATE_KEY: resolvedPrivateKey,
      VENDOR_PUBLIC_KEY: resolvedVendorKey,
    };
  }
  return _config!;
}

export function resetAgentConfig(): void {
  _config = null;
}
