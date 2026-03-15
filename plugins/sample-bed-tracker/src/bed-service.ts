import { randomUUID } from "node:crypto";
import type { PluginApi as PluginSandbox } from "@hospital-cms/plugin-runtime";
import type { Bed, WardSummary, OccupancySummary, BedTrackerConfig } from "./types";

/**
 * BedService — demonstrates how plugins use scoped storage.
 *
 * All data is persisted via `sandbox.storage` (plugin_storage collection),
 * scoped to this plugin + hospital. No direct DB access.
 */
export class BedService {
  constructor(
    private readonly sandbox: PluginSandbox,
    private readonly config: BedTrackerConfig,
  ) {}

  /**
   * Initialize default wards with beds (idempotent — skips if already set up).
   */
  async initialize(): Promise<void> {
    const existing = await this.sandbox.storage.get("initialized");
    if (existing) return;

    for (const wardName of this.config.defaultWards) {
      const wardId = wardName.toLowerCase().replace(/\s+/g, "-");
      const beds: Bed[] = [];

      // Create 10 beds per ward as a starting point
      for (let i = 1; i <= 10; i++) {
        beds.push({
          bedId: randomUUID(),
          wardId,
          label: `${wardId.toUpperCase()}-${String(i).padStart(3, "0")}`,
          status: "available",
          patientId: null,
          encounterId: null,
          assignedAt: null,
        });
      }

      await this.sandbox.storage.set(`ward:${wardId}:name`, wardName);
      await this.sandbox.storage.set(`ward:${wardId}:beds`, JSON.stringify(beds));
    }

    const wardIds = this.config.defaultWards.map((w) =>
      w.toLowerCase().replace(/\s+/g, "-"),
    );
    await this.sandbox.storage.set("wardIds", JSON.stringify(wardIds));
    await this.sandbox.storage.set("initialized", "true");

    this.sandbox.log.info("Bed tracker initialized with default wards");
  }

  /**
   * Get full occupancy summary across all wards.
   */
  async getSummary(): Promise<OccupancySummary> {
    const wardIds = await this.getWardIds();
    const wards: WardSummary[] = [];

    let totalBeds = 0;
    let totalOccupied = 0;
    let totalAvailable = 0;

    for (const wardId of wardIds) {
      const summary = await this.getWardSummary(wardId);
      wards.push(summary);
      totalBeds += summary.totalBeds;
      totalOccupied += summary.occupied;
      totalAvailable += summary.available;
    }

    return {
      wards,
      totalBeds,
      totalOccupied,
      totalAvailable,
      overallOccupancyPercent:
        totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get detailed bed status for a single ward.
   */
  async getWardBeds(wardId: string): Promise<Bed[]> {
    const raw = await this.sandbox.storage.get(`ward:${wardId}:beds`);
    if (!raw) return [];
    return JSON.parse(String(raw)) as Bed[];
  }

  /**
   * Assign a patient to the next available bed in a ward.
   */
  async assignBed(
    wardId: string,
    patientId: string,
    encounterId: string,
  ): Promise<Bed | null> {
    const beds = await this.getWardBeds(wardId);
    const available = beds.find((b) => b.status === "available");
    if (!available) {
      this.sandbox.log.warn(`No available beds in ward ${wardId}`);
      return null;
    }

    available.status = "occupied";
    available.patientId = patientId;
    available.encounterId = encounterId;
    available.assignedAt = new Date().toISOString();

    await this.sandbox.storage.set(`ward:${wardId}:beds`, JSON.stringify(beds));

    this.sandbox.log.info(
      `Bed ${available.label} assigned to patient ${patientId}`,
    );

    // Check if we crossed the alert threshold
    const summary = await this.getWardSummary(wardId);
    if (summary.occupancyPercent >= this.config.alertThresholdPercent) {
      this.sandbox.log.warn(
        `Ward ${wardId} occupancy at ${summary.occupancyPercent}% — above ${this.config.alertThresholdPercent}% threshold`,
      );
    }

    return available;
  }

  /**
   * Release a bed (mark as available) when patient is discharged.
   */
  async releaseBed(wardId: string, patientId: string): Promise<Bed | null> {
    const beds = await this.getWardBeds(wardId);
    const bed = beds.find(
      (b) => b.patientId === patientId && b.status === "occupied",
    );
    if (!bed) return null;

    bed.status = "available";
    bed.patientId = null;
    bed.encounterId = null;
    bed.assignedAt = null;

    await this.sandbox.storage.set(`ward:${wardId}:beds`, JSON.stringify(beds));

    this.sandbox.log.info(`Bed ${bed.label} released (patient ${patientId} discharged)`);
    return bed;
  }

  /**
   * Release all beds for a patient across all wards (on discharge event).
   */
  async releaseAllForPatient(patientId: string): Promise<number> {
    const wardIds = await this.getWardIds();
    let released = 0;

    for (const wardId of wardIds) {
      const bed = await this.releaseBed(wardId, patientId);
      if (bed) released++;
    }

    return released;
  }

  private async getWardIds(): Promise<string[]> {
    const raw = await this.sandbox.storage.get("wardIds");
    if (!raw) return [];
    return JSON.parse(String(raw)) as string[];
  }

  private async getWardSummary(wardId: string): Promise<WardSummary> {
    const beds = await this.getWardBeds(wardId);
    const wardName = String(
      (await this.sandbox.storage.get(`ward:${wardId}:name`)) ?? wardId,
    );
    const occupied = beds.filter((b) => b.status === "occupied").length;
    const available = beds.filter((b) => b.status === "available").length;
    const maintenance = beds.filter((b) => b.status === "maintenance").length;

    return {
      wardId,
      wardName,
      totalBeds: beds.length,
      occupied,
      available,
      maintenance,
      occupancyPercent:
        beds.length > 0 ? Math.round((occupied / beds.length) * 100) : 0,
    };
  }
}
