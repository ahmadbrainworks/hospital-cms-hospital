import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";
import { createLogger } from "@hospital-cms/logger";

const logger = createLogger({ module: "IntegrityChecker" });

export interface IntegrityReport {
  runtimeHash: string;
  dependencyHash: string;
  configHash: string;
  filesModified: string[];
  processUid: number;
  processGid: number;
  unsafeFlags: string[];
  computedAt: string;
}

export class IntegrityChecker {
  private baseline: IntegrityReport | null = null;
  private readonly apiDistPath: string;

  constructor(apiDistPath?: string) {
    this.apiDistPath = apiDistPath ?? join(process.cwd(), "dist");
  }

  async computeIntegrity(): Promise<IntegrityReport> {
    const runtimeHash = this.hashDirectory(this.apiDistPath, [".js", ".mjs"]);
    const dependencyHash = this.hashFile(join(process.cwd(), "package.json"));
    const configHash = this.hashConfigFiles();

    const unsafeFlags = process.execArgv.filter((flag) =>
      ["--inspect", "--no-warnings", "--allow-natives-syntax", "--expose-gc"].some(
        (f) => flag.startsWith(f),
      ),
    );

    const report: IntegrityReport = {
      runtimeHash,
      dependencyHash,
      configHash,
      filesModified: [],
      processUid: process.getuid?.() ?? -1,
      processGid: process.getgid?.() ?? -1,
      unsafeFlags,
      computedAt: new Date().toISOString(),
    };

    // Compare against baseline
    if (this.baseline) {
      report.filesModified = await this.detectTampering(this.baseline);
    } else {
      this.baseline = report;
    }

    return report;
  }

  async detectTampering(baseline: IntegrityReport): Promise<string[]> {
    const modified: string[] = [];
    const current = await this.computeIntegrity();

    if (current.runtimeHash !== baseline.runtimeHash) {
      modified.push("runtime_files");
    }
    if (current.dependencyHash !== baseline.dependencyHash) {
      modified.push("dependencies");
    }
    if (current.configHash !== baseline.configHash) {
      modified.push("config_files");
    }
    if (current.processUid !== baseline.processUid) {
      modified.push("process_uid");
    }

    return modified;
  }

  private hashDirectory(dirPath: string, extensions: string[]): string {
    const hash = createHash("sha256");

    if (!existsSync(dirPath)) {
      hash.update("directory-not-found");
      return hash.digest("hex");
    }

    try {
      const files = this.listFilesRecursive(dirPath)
        .filter((f) => extensions.includes(extname(f)))
        .sort();

      for (const file of files) {
        try {
          const content = readFileSync(file);
          hash.update(file);
          hash.update(content);
        } catch {
          hash.update(file + ":unreadable");
        }
      }
    } catch {
      hash.update("directory-error");
    }

    return hash.digest("hex");
  }

  private hashFile(filePath: string): string {
    try {
      if (!existsSync(filePath)) return "file-not-found";
      const content = readFileSync(filePath);
      return createHash("sha256").update(content).digest("hex");
    } catch {
      return "file-error";
    }
  }

  private hashConfigFiles(): string {
    const hash = createHash("sha256");
    const configFiles = [
      join(process.cwd(), "tsconfig.json"),
      join(process.cwd(), "package.json"),
    ];
    for (const f of configFiles) {
      hash.update(this.hashFile(f));
    }
    return hash.digest("hex");
  }

  private listFilesRecursive(dirPath: string): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(dirPath);
      for (const entry of entries) {
        const full = join(dirPath, entry);
        try {
          const stat = statSync(full);
          if (stat.isFile()) results.push(full);
          else if (stat.isDirectory() && entry !== "node_modules") {
            results.push(...this.listFilesRecursive(full));
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return results;
  }
}
