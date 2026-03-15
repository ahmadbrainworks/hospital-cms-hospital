/** A single bed within a ward */
export interface Bed {
  bedId: string;
  wardId: string;
  label: string;
  status: "available" | "occupied" | "maintenance";
  patientId: string | null;
  encounterId: string | null;
  assignedAt: string | null;
}

/** Summary for a single ward */
export interface WardSummary {
  wardId: string;
  wardName: string;
  totalBeds: number;
  occupied: number;
  available: number;
  maintenance: number;
  occupancyPercent: number;
}

/** Full occupancy snapshot */
export interface OccupancySummary {
  wards: WardSummary[];
  totalBeds: number;
  totalOccupied: number;
  totalAvailable: number;
  overallOccupancyPercent: number;
  lastUpdatedAt: string;
}

/** Plugin configuration loaded from manifest.config */
export interface BedTrackerConfig {
  defaultWards: string[];
  maxBedsPerWard: number;
  alertThresholdPercent: number;
}
