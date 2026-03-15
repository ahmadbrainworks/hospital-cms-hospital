export interface BackupStatus {
  backupConfigured: boolean;
  lastBackupAt: string | null;
  lastBackupSizeBytes: number | null;
  backupMethod: "mongodump" | "lvm_snapshot" | "cloud_snapshot" | "unknown" | "none";
  backupLocation: "local" | "remote" | "cloud" | "unknown";
  staleDays: number;
  healthy: boolean;
}

export interface InstanceRecord {
  _id?: string;
  instanceId: string;
  hospitalName: string;
  hospitalSlug: string;
  publicKey: string; // RSA-4096 public key PEM
  previousPublicKey?: string; // kept for 24h grace period during key rotation
  previousPublicKeyExpiresAt?: Date;
  agentVersion: string;
  lastHeartbeatAt: Date | null;
  lastHeartbeatIp: string | null;
  hardwareFingerprintHash: string | null;
  backupStatus: BackupStatus | null;
  networkQuality: 'excellent' | 'good' | 'degraded' | 'offline';
  metrics: InstanceMetrics;
  desiredState: DesiredState;
  registeredAt: Date;
  updatedAt: Date;
}

export interface InstanceMetrics {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  activeEncounters: number;
  totalPatients: number;
  uptimeSeconds: number;
  reportedAt: Date;
}

export interface DesiredState {
  version: string; // schema version
  plugins: DesiredPlugin[];
  theme: DesiredTheme | null;
  config: Record<string, string>; // non-secret config k/v
  updatedAt: Date;
}

export interface DesiredPlugin {
  pluginId: string;
  version: string;
  enabled: boolean;
  packageUrl: string;
  packageHash: string; // SHA-256 of zip
  signature: string;   // vendor signature
}

export interface DesiredTheme {
  themeId: string;
  version: string;
  packageUrl: string;
  packageHash: string;
  signature: string;
}

export interface HeartbeatPayload {
  instanceId: string;
  agentVersion: string;
  metrics: Omit<InstanceMetrics, 'reportedAt'>;
  networkQuality: InstanceRecord['networkQuality'];
  currentPackages: Array<{
    packageId: string;
    packageType: "plugin" | "theme" | "widget";
    version: string;
    status: string;
  }>;
  timestamp: number; // unix ms
  nonce: string;
  hardwareFingerprintHash?: string;
  backupStatus?: BackupStatus;
  signature: string; // signs everything except signature field
  reconciliation?: {
    appliedStateVersion: number;
    completedAt: string;
    packagesInstalled: string[];
    packagesRemoved: string[];
    packagesFailed: Array<{ packageId: string; error: string }>;
    configKeysApplied: string[];
    errors: string[];
  };
}

export interface CommandRecord {
  _id?: string;
  commandId: string;
  instanceId: string;
  type: string;
  payload: Record<string, unknown>;
  issuedAt: Date;
  expiresAt: Date;
  executedAt: Date | null;
  executionResult: { success: boolean; message: string } | null;
  signature: string;
}

export interface LicenseRecord {
  _id?: string;
  licenseId: string;
  instanceId: string;
  tier: 'community' | 'professional' | 'enterprise';
  features: string[];
  maxBeds: number;
  maxUsers: number;
  issuedAt: Date;
  expiresAt: Date;
  signature: string;
  revokedAt: Date | null;
  revokeReason: string | null;
}

// Request contexts for routes
export interface VendorRequest extends Express.Request {
  vendorKeyId?: string;
}
