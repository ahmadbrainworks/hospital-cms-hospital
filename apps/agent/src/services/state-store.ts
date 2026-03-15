import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "@hospital-cms/logger";
import type { LocalState } from "./types";

const logger = createLogger({ module: "StateStore" });

const DEFAULT_STATE: LocalState = {
  desiredStateVersion: 0,
  installedPackages: [],
  lastHeartbeatAt: null,
  lastReconcileAt: null,
};

export class StateStore {
  constructor(private readonly filePath: string) {}

  load(): LocalState {
    if (!existsSync(this.filePath)) {
      logger.info(
        { filePath: this.filePath },
        "No state file found, using defaults",
      );
      return { ...DEFAULT_STATE };
    }
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);

      // Migrate legacy state format (plugins/theme → packages)
      if (parsed.installedPlugins && !parsed.installedPackages) {
        const packages: LocalState["installedPackages"] = (
          parsed.installedPlugins as Array<{
            pluginId: string;
            version: string;
            status: string;
          }>
        ).map((p) => ({
          packageId: p.pluginId,
          packageType: "plugin" as const,
          version: p.version,
          status: p.status as "active" | "disabled" | "error",
        }));
        if (parsed.activeTheme) {
          packages.push({
            packageId: parsed.activeTheme.themeId,
            packageType: "theme",
            version: parsed.activeTheme.version,
            status: "active",
          });
        }
        return {
          desiredStateVersion:
            typeof parsed.desiredStateVersion === "string"
              ? parseInt(parsed.desiredStateVersion, 10) || 0
              : parsed.desiredStateVersion ?? 0,
          installedPackages: packages,
          lastHeartbeatAt: parsed.lastHeartbeatAt ?? null,
          lastReconcileAt: parsed.lastReconcileAt ?? null,
        };
      }

      return parsed as LocalState;
    } catch (err) {
      logger.error(
        { err, filePath: this.filePath },
        "Failed to load state file, using defaults",
      );
      return { ...DEFAULT_STATE };
    }
  }

  save(state: LocalState): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf-8");
  }
}
