import { z } from "zod";
import { config as loadDotenv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_LOCK_FILE,
  DEFAULT_PRIVATE_KEY_PATH,
  DEFAULT_PUBLIC_KEY_PATH,
  DEFAULT_PLUGINS_DIR,
  DEFAULT_THEMES_DIR,
  VENDOR_CP_API_URL,
  EMBEDDED_VENDOR_PUBLIC_KEY,
} from "./paths";

function loadEnvironmentFiles(): void {
  const candidateRoots = [
    resolve(__dirname, "../../.."),
    process.cwd(),
  ].filter((value, index, arr) => arr.indexOf(value) === index);

  for (const root of candidateRoots) {
    const envPath = resolve(root, ".env");
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath });
    }

    const localEnvPath = resolve(root, ".env.local");
    if (existsSync(localEnvPath)) {
      loadDotenv({ path: localEnvPath, override: true });
    }
  }
}

/**
 * Read the installer lock file and inject generated values into process.env
 * for any key that is not already set. This lets all apps pick up secrets
 * (JWT_SECRET, ENCRYPTION_KEY, VENDOR_PUBLIC_KEY, etc.) that the installer
 * generated during installation — no manual .env editing required.
 *
 * Env vars always take precedence (we only set if missing or empty).
 */
function loadInstallerOutput(): void {
  const lockFilePath =
    process.env["INSTALLER_LOCK_FILE"] ?? DEFAULT_LOCK_FILE;

  if (!existsSync(lockFilePath)) return;

  try {
    const data = JSON.parse(readFileSync(lockFilePath, "utf-8")) as Record<string, unknown>;

    // Map lock-file keys → env var names
    const mapping: Record<string, string | undefined> = {
      INSTANCE_ID: data["instanceId"] as string | undefined,
      VENDOR_PUBLIC_KEY: data["vendorPublicKey"] as string | undefined,
      JWT_SECRET: data["jwtSecret"] as string | undefined,
      REFRESH_TOKEN_SECRET: data["refreshTokenSecret"] as string | undefined,
      ENCRYPTION_KEY: data["encryptionKey"] as string | undefined,
      MFA_ENCRYPTION_KEY: data["mfaEncryptionKey"] as string | undefined,
      AGENT_SECRET: data["agentSecret"] as string | undefined,
      API_ADMIN_TOKEN: data["agentSecret"] as string | undefined, // Same shared secret
      MONGODB_URI: data["mongoUri"] as string | undefined,
      REDIS_URL: data["redisUrl"] as string | undefined,
    };

    for (const [envKey, value] of Object.entries(mapping)) {
      if (value && (!process.env[envKey] || process.env[envKey] === "")) {
        process.env[envKey] = value;
      }
    }
  } catch {
    // Lock file corrupt or unreadable — ignore, let schema validation catch it
  }
}

loadEnvironmentFiles();
loadInstallerOutput();

/** Re-read the installer lock file and inject into process.env.
 *  Call this after installation completes (e.g. when the API auto-restarts). */
export { loadInstallerOutput };

// ENVIRONMENT CONFIGURATION WITH STRICT VALIDATION
// Fails fast on startup if any required variable is missing.

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),

  // MongoDB
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB_NAME: z.string().min(1).default("hospital_cms"),

  // Redis
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRY: z.string().default("15m"),
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),
  REFRESH_TOKEN_EXPIRY: z.string().default("7d"),

  // Instance Identity
  INSTANCE_ID: z.string().optional(),
  INSTANCE_PRIVATE_KEY_PATH: z
    .string()
    .default(DEFAULT_PRIVATE_KEY_PATH),
  INSTANCE_PUBLIC_KEY_PATH: z
    .string()
    .default(DEFAULT_PUBLIC_KEY_PATH),

  // Control Panel
  CONTROL_PANEL_URL: z
    .string()
    .url("CONTROL_PANEL_URL must be a valid URL")
    .default(VENDOR_CP_API_URL),
  CONTROL_PANEL_API_KEY: z.string().optional(),
  VENDOR_PUBLIC_KEY: z.string().default(EMBEDDED_VENDOR_PUBLIC_KEY),

  // Encryption
  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)")
    .optional(),

  // API Server
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((s) => s.split(",").map((o) => o.trim())),

  INSTALLER_LOCK_FILE: z.string().default(DEFAULT_LOCK_FILE),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  // Audit
  AUDIT_LOG_COLLECTION: z.string().default("audit_logs"),

  // Plugin / Theme Storage
  PLUGIN_STORAGE_PATH: z.string().default(DEFAULT_PLUGINS_DIR),
  THEME_STORAGE_PATH: z.string().default(DEFAULT_THEMES_DIR),

  // Agent shared secret — must match the agent's API_ADMIN_TOKEN.
  // Required in production so package install routes are agent-only.
  AGENT_SECRET: z.string().optional(),

  // MFA encryption key (AES-256-GCM, 64 hex chars = 32 bytes)
  MFA_ENCRYPTION_KEY: z
    .string()
    .length(64, "MFA_ENCRYPTION_KEY must be 64 hex chars (32 bytes)")
    .optional(),

  // Observability
  LOG_LEVEL: z
    .enum(["error", "warn", "info", "debug", "trace"])
    .default("info"),
  METRICS_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config !== null) {
    return _config;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Configuration validation failed:\n${formatted}\n\nEnsure all required environment variables are set.`,
    );
  }

  _config = result.data;
  return _config;
}

export function resetConfig(): void {
  _config = null;
}

export const isDevelopment = (): boolean =>
  getConfig().NODE_ENV === "development";
export const isProduction = (): boolean =>
  getConfig().NODE_ENV === "production";
export const isTest = (): boolean => getConfig().NODE_ENV === "test";

// Per-app config schemas — import these in the respective apps instead of
// the monolithic getConfig() to avoid requiring irrelevant env vars.
export { getInstallerConfig, resetInstallerConfig } from "./schemas/installer";
export type { InstallerConfig } from "./schemas/installer";

export { getControlPanelConfig, resetControlPanelConfig } from "./schemas/control-panel";
export type { ControlPanelConfig } from "./schemas/control-panel";

export { getAgentConfig as getAgentConfigFromPackage, resetAgentConfig } from "./schemas/agent";
export type { AgentConfig as AgentConfigFromPackage } from "./schemas/agent";

export {
  DATA_DIR,
  DEFAULT_LOCK_FILE,
  DEFAULT_PRIVATE_KEY_PATH,
  DEFAULT_PUBLIC_KEY_PATH,
  VENDOR_CP_API_URL,
  EMBEDDED_VENDOR_PUBLIC_KEY,
} from "./paths";
