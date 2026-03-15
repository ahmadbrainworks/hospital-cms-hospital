import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { createLogger } from "@hospital-cms/logger";

const logger = createLogger({ module: "BackupDetector" });

export interface BackupStatus {
  backupConfigured: boolean;
  lastBackupAt: string | null;
  lastBackupSizeBytes: number | null;
  backupMethod: "mongodump" | "lvm_snapshot" | "cloud_snapshot" | "unknown" | "none";
  backupLocation: "local" | "remote" | "cloud" | "unknown";
  staleDays: number;
  healthy: boolean;
}

const BACKUP_DIR =
  process.env["BACKUP_DIR"] ?? "/var/backups/hospital-cms/";

export function detectBackupStatus(): BackupStatus {
  try {
    // 1. Check for mongodump artifacts
    if (existsSync(BACKUP_DIR)) {
      const entries = readdirSync(BACKUP_DIR);
      // mongodump creates directories like: 2024-01-15_030000 or dump_20240115
      const backupDirs = entries
        .filter((e) => {
          try {
            return statSync(join(BACKUP_DIR, e)).isDirectory();
          } catch {
            return false;
          }
        })
        .map((e) => ({
          name: e,
          mtime: statSync(join(BACKUP_DIR, e)).mtime,
          size: getDirSize(join(BACKUP_DIR, e)),
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (backupDirs.length > 0) {
        const latest = backupDirs[0]!;
        const staleDays = (Date.now() - latest.mtime.getTime()) / (1000 * 60 * 60 * 24);
        return {
          backupConfigured: true,
          lastBackupAt: latest.mtime.toISOString(),
          lastBackupSizeBytes: latest.size,
          backupMethod: "mongodump",
          backupLocation: "local",
          staleDays: Math.round(staleDays * 10) / 10,
          healthy: staleDays < 1,
        };
      }
    }

    // 2. Check for cron-scheduled backups
    const hasCron = checkCronBackup();
    if (hasCron) {
      return {
        backupConfigured: true,
        lastBackupAt: null,
        lastBackupSizeBytes: null,
        backupMethod: "unknown",
        backupLocation: "unknown",
        staleDays: 0,
        healthy: false, // configured but no artifacts found
      };
    }

    // 3. No backup detected
    return {
      backupConfigured: false,
      lastBackupAt: null,
      lastBackupSizeBytes: null,
      backupMethod: "none",
      backupLocation: "unknown",
      staleDays: -1,
      healthy: false,
    };
  } catch (err) {
    logger.warn({ err }, "Failed to detect backup status");
    return {
      backupConfigured: false,
      lastBackupAt: null,
      lastBackupSizeBytes: null,
      backupMethod: "none",
      backupLocation: "unknown",
      staleDays: -1,
      healthy: false,
    };
  }
}

function getDirSize(dirPath: string): number {
  try {
    let total = 0;
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      const full = join(dirPath, entry);
      const s = statSync(full);
      if (s.isFile()) total += s.size;
      else if (s.isDirectory()) total += getDirSize(full);
    }
    return total;
  } catch {
    return 0;
  }
}

function checkCronBackup(): boolean {
  const cronPaths = ["/etc/cron.d", "/var/spool/cron/crontabs"];
  for (const cronDir of cronPaths) {
    try {
      if (!existsSync(cronDir)) continue;
      const files = readdirSync(cronDir);
      for (const file of files) {
        try {
          const content = readFileSync(join(cronDir, file), "utf-8");
          if (/mongodump|backup.*hospital|hospital.*backup/i.test(content)) {
            return true;
          }
        } catch {
          // Permission denied — skip
        }
      }
    } catch {
      // Directory not accessible
    }
  }
  return false;
}
