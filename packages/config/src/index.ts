import { z } from "zod";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

loadEnvironmentFiles();

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
    .default(`${process.env["HOME"] ?? "/home/ahmad"}/hospital-cms/instance.key`),
  INSTANCE_PUBLIC_KEY_PATH: z
    .string()
    .default(`${process.env["HOME"] ?? "/home/ahmad"}/hospital-cms/instance.pub`),

  // Control Panel
  CONTROL_PANEL_URL: z
    .string()
    .url("CONTROL_PANEL_URL must be a valid URL")
    .default("https://control.hospitalcms.io"),
  CONTROL_PANEL_API_KEY: z.string().optional(),
  VENDOR_PUBLIC_KEY: z.string().default(""),

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

  INSTALLER_LOCK_FILE: z.string().default(`${process.env["HOME"] ?? "/home/ahmad"}/hospital-cms/installer.lock`),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  // Audit
  AUDIT_LOG_COLLECTION: z.string().default("audit_logs"),

  // Plugin / Theme Storage
  PLUGIN_STORAGE_PATH: z.string().default("/var/hospital-cms/plugins"),
  THEME_STORAGE_PATH: z.string().default("/var/hospital-cms/themes"),

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
