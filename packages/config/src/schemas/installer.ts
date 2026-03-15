import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  INSTALLER_LOCK_FILE: z
    .string()
    .default(`${process.env["HOME"] ?? "/home/ahmad"}/hospital-cms/installer.lock`),
  INSTANCE_PRIVATE_KEY_PATH: z
    .string()
    .default(`${process.env["HOME"] ?? "/home/ahmad"}/hospital-cms/instance.key`),
  INSTANCE_PUBLIC_KEY_PATH: z
    .string()
    .default(`${process.env["HOME"] ?? "/home/ahmad"}/hospital-cms/instance.pub`),
  CONTROL_PANEL_URL: z
    .string()
    .url()
    .default("http://localhost:4001"),
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
