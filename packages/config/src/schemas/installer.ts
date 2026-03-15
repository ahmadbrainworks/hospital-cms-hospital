import { z } from "zod";
import {
  DEFAULT_LOCK_FILE,
  DEFAULT_PRIVATE_KEY_PATH,
  DEFAULT_PUBLIC_KEY_PATH,
  VENDOR_CP_API_URL,
} from "../paths";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  INSTALLER_LOCK_FILE: z
    .string()
    .default(DEFAULT_LOCK_FILE),
  INSTANCE_PRIVATE_KEY_PATH: z
    .string()
    .default(DEFAULT_PRIVATE_KEY_PATH),
  INSTANCE_PUBLIC_KEY_PATH: z
    .string()
    .default(DEFAULT_PUBLIC_KEY_PATH),
  CONTROL_PANEL_URL: z
    .string()
    .url()
    .default(VENDOR_CP_API_URL),
  /** Token issued by vendor to authorize a new instance registration */
  REGISTRATION_TOKEN: z.string().optional(),
  MONGODB_URI: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug", "trace"]).default("info"),
});

export type InstallerConfig = z.infer<typeof schema>;

let _config: InstallerConfig | null = null;

export function getInstallerConfig(): InstallerConfig {
  if (!_config) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      const formatted = result.error.errors
        .map((e) => `  ${e.path.join(".")}: ${e.message}`)
        .join("\n");
      throw new Error(`Installer config validation failed:\n${formatted}`);
    }
    _config = result.data;
  }
  return _config;
}

export function resetInstallerConfig(): void {
  _config = null;
}
