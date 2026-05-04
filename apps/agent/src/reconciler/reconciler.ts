import { createLogger } from "@hospital-cms/logger";
import { readFile } from "node:fs/promises";
import type {
  EnrichedDesiredStateDocument,
  EnrichedDesiredPackageEntry,
  ReconciliationSummary,
} from "@hospital-cms/contracts";
import type { LocalState, InstalledPackage } from "../services/types";
import type { PackageInstaller } from "./package-installer";

const logger = createLogger({ module: "Reconciler" });

/**
 * Compares desired state from control-panel with local state and drives
 * the system to converge. Idempotent — safe to run repeatedly.
 */
export class Reconciler {
  constructor(
    private readonly packageInstaller: PackageInstaller,
    private readonly apiBaseUrl: string,
    private readonly adminToken: string | undefined,
    private readonly hospitalId: string,
  ) {}

  async reconcile(
    desired: EnrichedDesiredStateDocument,
    local: LocalState,
  ): Promise<{ state: LocalState; summary: ReconciliationSummary }> {
    // Fast path: if version unchanged, nothing to do
    if (desired.version === local.desiredStateVersion) {
      logger.debug(
        { version: desired.version },
        "Desired state unchanged, skipping reconcile",
      );
      return {
        state: local,
        summary: this.emptySummary(desired.version),
      };
    }

    logger.info(
      {
        desiredVersion: desired.version,
        localVersion: local.desiredStateVersion,
      },
      "Reconciling state",
    );

    const summary: ReconciliationSummary = {
      appliedStateVersion: desired.version,
      completedAt: "",
      packagesInstalled: [],
      packagesRemoved: [],
      packagesFailed: [],
      configKeysApplied: [],
      errors: [],
    };

    let updated: LocalState = {
      ...local,
      installedPackages: [...local.installedPackages],
    };

    updated = await this.reconcilePackages(desired, updated, summary);
    updated = await this.reconcileConfig(desired, updated, summary);

    updated.desiredStateVersion = desired.version;
    updated.lastReconcileAt = new Date().toISOString();
    summary.completedAt = updated.lastReconcileAt;

    logger.info({ version: desired.version }, "Reconcile complete");
    return { state: updated, summary };
  }

  private async reconcilePackages(
    desired: EnrichedDesiredStateDocument,
    local: LocalState,
    summary: ReconciliationSummary,
  ): Promise<LocalState> {
    const updated = {
      ...local,
      installedPackages: [...local.installedPackages],
    };

    for (const entry of desired.packages) {
      if (entry.action === "remove") {
        await this.removePackage(entry, updated, summary);
        continue;
      }

      const localPkg = updated.installedPackages.find(
        (p) => p.packageId === entry.packageId,
      );

      if (entry.action === "install" || entry.action === "update") {
        if (!localPkg) {
          await this.installPackage(entry, updated, summary);
        } else if (localPkg.version !== entry.version) {
          await this.upgradePackage(entry, localPkg.version, updated, summary);
        } else if (localPkg.status === "error") {
          // Retry failed packages
          await this.installPackage(entry, updated, summary);
        }
      } else if (entry.action === "pin") {
        // Pin means "should be installed at this exact version"
        if (!localPkg) {
          await this.installPackage(entry, updated, summary);
        } else if (localPkg.version !== entry.version) {
          await this.upgradePackage(entry, localPkg.version, updated, summary);
        }
        // If already at correct version, do nothing
      }
    }

    // Remove packages no longer in desired state
    const desiredIds = new Set(desired.packages.map((p) => p.packageId));
    for (const localPkg of local.installedPackages) {
      if (!desiredIds.has(localPkg.packageId)) {
        await this.removePackageById(
          localPkg.packageId,
          localPkg.packageType,
          updated,
          summary,
        );
      }
    }

    return updated;
  }

  private async installPackage(
    entry: EnrichedDesiredPackageEntry,
    state: LocalState,
    summary: ReconciliationSummary,
  ): Promise<void> {
    logger.info(
      {
        packageId: entry.packageId,
        version: entry.version,
        type: entry.packageType,
      },
      "Installing package",
    );
    try {
      const zipPath = await this.packageInstaller.downloadAndVerifyPackage(entry);
      const packageBuffer = await readFile(zipPath);
      const packageBase64 = packageBuffer.toString("base64");

      if (entry.packageType === "plugin") {
        const manifest = await this.extractManifestFromZip(zipPath);
        await this.callApi("POST", "/api/agent/apply-plugin", {
          hospitalId: this.hospitalId,
          manifestJson: JSON.stringify(manifest),
          packageBase64,
          actorId: "agent",
        });
      } else if (entry.packageType === "theme") {
        const manifest = await this.extractManifestFromZip(zipPath);
        await this.callApi("POST", "/api/agent/apply-theme", {
          hospitalId: this.hospitalId,
          manifestJson: JSON.stringify(manifest),
          actorId: "agent",
        });
      } else if (entry.packageType === "widget") {
        logger.info({ packageId: entry.packageId }, "Widget installation - not yet implemented");
        // TODO: implement widget installation
        // const manifest = await this.extractManifestFromZip(zipPath);
        // await this.callApi("POST", "/api/agent/apply-widget", { ... });
      }

      const pkg: InstalledPackage = {
        packageId: entry.packageId,
        packageType: entry.packageType,
        version: entry.version!,
        status: "active",
      };
      const idx = state.installedPackages.findIndex(
        (p) => p.packageId === entry.packageId,
      );
      if (idx >= 0) {
        state.installedPackages[idx] = pkg;
      } else {
        state.installedPackages.push(pkg);
      }
      summary.packagesInstalled.push(entry.packageId);
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Unknown install error";
      logger.error(
        { err, packageId: entry.packageId },
        "Package install failed",
      );
      const pkg: InstalledPackage = {
        packageId: entry.packageId,
        packageType: entry.packageType,
        version: entry.version!,
        status: "error",
      };
      const idx = state.installedPackages.findIndex(
        (p) => p.packageId === entry.packageId,
      );
      if (idx >= 0) state.installedPackages[idx] = pkg;
      else state.installedPackages.push(pkg);
      summary.packagesFailed.push({ packageId: entry.packageId, error: errMsg });
    }
  }

  private async extractManifestFromZip(zipPath: string): Promise<unknown> {
    const extractZip = (await import("extract-zip")).default;
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const tempDir = await mkdtemp(join(tmpdir(), "pkg-extract-"));
    try {
      await extractZip(zipPath, { dir: tempDir });
      const manifestPath = join(tempDir, "manifest.json");
      const manifestContent = await readFile(manifestPath, "utf-8");
      return JSON.parse(manifestContent);
    } finally {
      void rm(tempDir, { recursive: true, force: true });
    }
  }

  private async upgradePackage(
    entry: EnrichedDesiredPackageEntry,
    _fromVersion: string,
    state: LocalState,
    summary: ReconciliationSummary,
  ): Promise<void> {
    logger.info(
      { packageId: entry.packageId, to: entry.version, type: entry.packageType },
      "Upgrading package",
    );

    if (entry.packageType === "plugin") {
      // Deactivate old before installing new
      try {
        await this.callApi("POST", "/api/agent/deactivate-plugin", {
          hospitalId: this.hospitalId,
          pluginId: entry.packageId,
        });
      } catch {
        // May fail if not yet active — proceed
      }
    }

    await this.installPackage(entry, state, summary);
  }

  private async removePackage(
    entry: EnrichedDesiredPackageEntry,
    state: LocalState,
    summary: ReconciliationSummary,
  ): Promise<void> {
    const localPkg = state.installedPackages.find(
      (p) => p.packageId === entry.packageId,
    );
    if (!localPkg) return;
    await this.removePackageById(
      localPkg.packageId,
      localPkg.packageType,
      state,
      summary,
    );
  }

  private async removePackageById(
    packageId: string,
    packageType: string,
    state: LocalState,
    summary: ReconciliationSummary,
  ): Promise<void> {
    logger.info({ packageId, packageType }, "Removing package");
    try {
      if (packageType === "plugin") {
        await this.callApi("POST", "/api/agent/deactivate-plugin", {
          hospitalId: this.hospitalId,
          pluginId: packageId,
        });
      } else if (packageType === "theme") {
        await this.callApi("POST", "/api/agent/remove-theme", {
          hospitalId: this.hospitalId,
        });
      }
      state.installedPackages = state.installedPackages.filter(
        (p) => p.packageId !== packageId,
      );
      summary.packagesRemoved.push(packageId);
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Unknown remove error";
      logger.error({ err, packageId }, "Package remove failed");
      summary.packagesFailed.push({ packageId, error: errMsg });
    }
  }

  private async reconcileConfig(
    desired: EnrichedDesiredStateDocument,
    local: LocalState,
    summary: ReconciliationSummary,
  ): Promise<LocalState> {
    const configKeys = Object.keys(desired.config);
    if (configKeys.length === 0) return local;

    try {
      await this.callApi("POST", "/api/agent/apply-config", {
        config: desired.config,
      });
      summary.configKeysApplied.push(...configKeys);
      logger.info({ keys: configKeys }, "Config applied");
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Config apply failed";
      logger.error({ err }, "Config apply failed");
      summary.errors.push(errMsg);
    }
    return local;
  }

  private emptySummary(version: number): ReconciliationSummary {
    return {
      appliedStateVersion: version,
      completedAt: new Date().toISOString(),
      packagesInstalled: [],
      packagesRemoved: [],
      packagesFailed: [],
      configKeysApplied: [],
      errors: [],
    };
  }

  private async callApi(
    method: string,
    path: string,
    body: unknown,
  ): Promise<void> {
    if (!this.adminToken) {
      logger.debug({ method, path }, "No admin token — skipping API call");
      return;
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.adminToken}`,
        "X-Agent-Secret": this.adminToken,
      },
      signal: AbortSignal.timeout(30000),
    };

    if (method !== "GET" && method !== "DELETE") {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.apiBaseUrl}${path}`, fetchOptions);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `API ${method} ${path} failed: ${response.status} ${text}`,
      );
    }
  }
}
