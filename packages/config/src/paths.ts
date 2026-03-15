/**
 * Shared path constants for the hospital CMS data directory.
 *
 * All generated files (lock file, keys, state, packages, plugins, themes)
 * live under a single `.data/` directory in the project root.
 * Override with HOSPITAL_DATA_DIR env var for custom deployments.
 */
import { resolve } from "node:path";

const MONOREPO_ROOT = resolve(__dirname, "../../..");

export const DATA_DIR =
  process.env["HOSPITAL_DATA_DIR"]
  ?? resolve(MONOREPO_ROOT, ".data");

export const DEFAULT_LOCK_FILE = resolve(DATA_DIR, "installer.lock");
export const DEFAULT_PRIVATE_KEY_PATH = resolve(DATA_DIR, "instance.key");
export const DEFAULT_PUBLIC_KEY_PATH = resolve(DATA_DIR, "instance.pub");
export const DEFAULT_STATE_FILE = resolve(DATA_DIR, "state.json");
export const DEFAULT_PACKAGES_DIR = resolve(DATA_DIR, "packages");
export const DEFAULT_PLUGINS_DIR = resolve(DATA_DIR, "plugins");
export const DEFAULT_THEMES_DIR = resolve(DATA_DIR, "themes");

/** Fixed vendor control-panel API URL — all hospital instances communicate here. */
export const VENDOR_CP_API_URL = "https://cp-api.hospitalcms.com";
