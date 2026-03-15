import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  CONTROL_PANEL_URL: z.string().url(),
  INSTANCE_ID: z.string().uuid().optional(),
  /** RSA-4096 instance private key (PEM) — signs heartbeat payloads */
  AGENT_PRIVATE_KEY: z.string().min(100).optional(),
  /** RSA-4096 vendor public key (PEM) — verifies signed commands/licenses */
  VENDOR_PUBLIC_KEY: z.string().min(100),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(10000).default(30000),
  AGENT_VERSION: z.string().default("1.0.0"),
  STATE_FILE_PATH: z
    .string()
    .default(`${process.env["HOME"] ?? "/home/ahmad"}/hospital-cms/state.json`),
  PACKAGES_DIR: z
    .string()
    .default(`${process.env["HOME"] ?? "/home/ahmad"}/hospital-cms/packages`),
  /** Hospital API base URL for agent-side config pushes */
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  API_ADMIN_TOKEN: z.string().optional(),
  /** Path to persist the private key — required for key rotation support */
  AGENT_PRIVATE_KEY_PATH: z.string().optional(),
  INSTALLER_LOCK_FILE: z
    .string()
    .default(`${process.env["HOME"] ?? "/home/ahmad"}/hospital-cms/installer.lock`),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug", "trace"]).default("info"),
});

type AgentConfigInput = z.infer<typeof schema>;
export type AgentConfig = Omit<AgentConfigInput, "INSTANCE_ID" | "AGENT_PRIVATE_KEY"> & {
  INSTANCE_ID: string;
  AGENT_PRIVATE_KEY: string;
};

let _config: AgentConfig | null = null;

function readInstanceIdFromLockFile(lockFilePath: string): string | undefined {
  if (!existsSync(lockFilePath)) return undefined;

  try {
    const raw = readFileSync(lockFilePath, "utf-8");
    const parsed = JSON.parse(raw) as { instanceId?: string };
    return parsed.instanceId;
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

    const resolvedInstanceId =
      result.data.INSTANCE_ID
      ?? readInstanceIdFromLockFile(result.data.INSTALLER_LOCK_FILE);
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

    process.env["INSTANCE_ID"] ??= resolvedInstanceId;
    process.env["AGENT_PRIVATE_KEY"] ??= resolvedPrivateKey;

    _config = {
      ...result.data,
      INSTANCE_ID: resolvedInstanceId,
      AGENT_PRIVATE_KEY: resolvedPrivateKey,
    };
  }
  return _config;
}

export function resetAgentConfig(): void {
  _config = null;
}
