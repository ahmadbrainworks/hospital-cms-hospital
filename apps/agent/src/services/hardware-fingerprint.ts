import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { createLogger } from "@hospital-cms/logger";

const logger = createLogger({ module: "HardwareFingerprint" });

export interface HardwareFingerprint {
  machineId: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryMB: number;
  primaryMacHash: string;
  diskSerialHash: string;
  osRelease: string;
}

function readFileSafe(path: string): string {
  try {
    if (existsSync(path)) {
      return readFileSync(path, "utf-8").trim();
    }
  } catch {
    // Silently ignore — some files may not be accessible
  }
  return "";
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function getMachineId(): string {
  // /etc/machine-id is standard on Linux (systemd)
  const mid = readFileSafe("/etc/machine-id");
  if (mid) return mid;

  // Fallback: /var/lib/dbus/machine-id
  const dbus = readFileSafe("/var/lib/dbus/machine-id");
  if (dbus) return dbus;

  return "unknown";
}

function getCpuInfo(): { model: string; cores: number } {
  const cpuinfo = readFileSafe("/proc/cpuinfo");
  if (!cpuinfo) return { model: "unknown", cores: 0 };

  const modelMatch = cpuinfo.match(/model name\s*:\s*(.+)/);
  const coreCount = (cpuinfo.match(/^processor\s*:/gm) || []).length;
  return {
    model: modelMatch?.[1]?.trim() ?? "unknown",
    cores: coreCount || 1,
  };
}

function getTotalMemoryMB(): number {
  const meminfo = readFileSafe("/proc/meminfo");
  if (!meminfo) return 0;
  const match = meminfo.match(/MemTotal:\s*(\d+)\s*kB/);
  return match?.[1] ? Math.round(parseInt(match[1], 10) / 1024) : 0;
}

function getPrimaryMacHash(): string {
  // Read from /sys/class/net — skip lo and virtual interfaces
  try {
    const { readdirSync } = require("fs");
    const interfaces = readdirSync("/sys/class/net") as string[];
    for (const iface of interfaces) {
      if (iface === "lo" || iface.startsWith("veth") || iface.startsWith("docker") || iface.startsWith("br-")) {
        continue;
      }
      const mac = readFileSafe(`/sys/class/net/${iface}/address`);
      if (mac && mac !== "00:00:00:00:00:00") {
        return sha256(mac);
      }
    }
  } catch {
    // Fallback
  }
  return sha256("unknown-mac");
}

function getDiskSerialHash(): string {
  // Try /sys/block/sda/device/serial or /sys/block/vda/device/serial
  for (const disk of ["sda", "vda", "nvme0n1"]) {
    const serial = readFileSafe(`/sys/block/${disk}/device/serial`);
    if (serial) return sha256(serial);
  }
  // Fallback: use root filesystem UUID from /etc/fstab or blkid
  const fstab = readFileSafe("/etc/fstab");
  const uuidMatch = fstab.match(/UUID=([a-f0-9-]+)/i);
  if (uuidMatch?.[1]) return sha256(uuidMatch[1]);

  return sha256("unknown-disk");
}

function getOsRelease(): string {
  const release = readFileSafe("/etc/os-release");
  if (!release) return "unknown";
  const match = release.match(/PRETTY_NAME="?([^"\n]+)"?/);
  return match?.[1]?.trim() ?? "unknown";
}

export function computeFingerprint(): HardwareFingerprint {
  const cpu = getCpuInfo();
  return {
    machineId: getMachineId(),
    cpuModel: cpu.model,
    cpuCores: cpu.cores,
    totalMemoryMB: getTotalMemoryMB(),
    primaryMacHash: getPrimaryMacHash(),
    diskSerialHash: getDiskSerialHash(),
    osRelease: getOsRelease(),
  };
}

export function computeFingerprintHash(fp: HardwareFingerprint): string {
  const canonical = JSON.stringify(fp, Object.keys(fp).sort());
  return sha256(canonical);
}

let _cachedHash: string | null = null;

/**
 * Compute the hardware fingerprint hash once at startup and cache it.
 * The fingerprint shouldn't change during a single process lifetime.
 */
export function getHardwareFingerprintHash(): string {
  if (!_cachedHash) {
    try {
      const fp = computeFingerprint();
      _cachedHash = computeFingerprintHash(fp);
      logger.info(
        { hash: _cachedHash.substring(0, 12) + "..." },
        "Hardware fingerprint computed",
      );
    } catch (err) {
      logger.warn({ err }, "Failed to compute hardware fingerprint — using fallback");
      _cachedHash = sha256("fingerprint-unavailable-" + process.pid);
    }
  }
  return _cachedHash;
}
