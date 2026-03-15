/**
 * sample-bed-tracker — Hospital CMS Sample Plugin
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  HOW THIS PLUGIN WORKS                                      │
 * │                                                             │
 * │  1. LIFECYCLE                                                │
 * │     - activate(sandbox) is called by PluginRegistry          │
 * │     - sandbox provides: storage, logger, assertPermission    │
 * │     - deactivate(sandbox) cleans up on shutdown              │
 * │                                                             │
 * │  2. SCOPED STORAGE                                          │
 * │     - sandbox.storage.get/set/delete — data is isolated     │
 * │     - Stored in plugin_storage collection, keyed by          │
 * │       pluginId + hospitalId — no cross-plugin leakage       │
 * │                                                             │
 * │  3. EVENT BUS                                                │
 * │     - Plugin subscribes to events in manifest.events        │
 * │     - Registry auto-wires handlers named on<EventName>      │
 * │     - Failures are isolated — one plugin crash won't         │
 * │       affect others                                         │
 * │                                                             │
 * │  4. ROUTE HANDLERS                                          │
 * │     - Declared in manifest.routes, exported from index.ts   │
 * │     - Mounted at /plugins/<pluginId>/<path>                 │
 * │     - Each handler receives (req) → returns response object │
 * │                                                             │
 * │  5. UI SLOTS                                                │
 * │     - manifest.uiSlots declares where widgets appear        │
 * │     - Frontend renders them in matching slot containers     │
 * └─────────────────────────────────────────────────────────────┘
 */
import type { PluginApi as PluginSandbox } from "@hospital-cms/plugin-runtime";
import { BedService } from "./bed-service";
import { registerHandlers } from "./handlers";
import type { BedTrackerConfig } from "./types";

let bedService: BedService | null = null;

// ── Lifecycle ─────────────────────────────────────────────────

/**
 * Called by PluginRegistry.activate() — the plugin's entry point.
 *
 * @param sandbox - Scoped API: storage, logger, assertPermission
 */
export async function activate(sandbox: PluginSandbox): Promise<void> {
  sandbox.log.info("sample-bed-tracker activating...");

  // Load configuration from scoped storage (set by the installer or admin)
  const config: BedTrackerConfig = {
    defaultWards: JSON.parse(
      String(
        (await sandbox.storage.get("config:defaultWards")) ??
          '["ICU","General","Pediatrics","Maternity","Emergency"]',
      ),
    ),
    maxBedsPerWard: parseInt(
      String((await sandbox.storage.get("config:maxBedsPerWard")) ?? "50"),
      10,
    ),
    alertThresholdPercent: parseInt(
      String(
        (await sandbox.storage.get("config:alertThresholdPercent")) ?? "90",
      ),
      10,
    ),
  };

  bedService = new BedService(sandbox, config);

  // Initialize default wards/beds on first activation (idempotent)
  await bedService.initialize();

  // Register event handlers (returned to registry for wiring)
  const handlers = registerHandlers(bedService, config);

  sandbox.log.info(
    `sample-bed-tracker activated. Events: ${Object.keys(handlers).join(", ")}`,
  );
}

/**
 * Called by PluginRegistry.deactivate() — clean up resources.
 */
export async function deactivate(sandbox: PluginSandbox): Promise<void> {
  bedService = null;
  sandbox.log.info("sample-bed-tracker deactivated");
}

// ── Route Handlers ────────────────────────────────────────────
// These are declared in manifest.routes and mounted by the registry
// at /plugins/sample-bed-tracker/<path>.

/**
 * GET /plugins/sample-bed-tracker/summary
 * Returns bed occupancy across all wards.
 */
export async function getSummary(): Promise<unknown> {
  if (!bedService) return { error: "Plugin not active" };
  const summary = await bedService.getSummary();
  return { success: true, data: summary };
}

/**
 * GET /plugins/sample-bed-tracker/ward/:wardId
 * Returns detailed bed status for a specific ward.
 */
export async function getWardBeds(req: {
  params: { wardId: string };
}): Promise<unknown> {
  if (!bedService) return { error: "Plugin not active" };
  const beds = await bedService.getWardBeds(req.params.wardId);
  return { success: true, data: { wardId: req.params.wardId, beds } };
}

/**
 * POST /plugins/sample-bed-tracker/ward/:wardId/assign
 * Assign a patient to the next available bed.
 */
export async function assignBed(req: {
  params: { wardId: string };
  body: { patientId: string; encounterId: string };
}): Promise<unknown> {
  if (!bedService) return { error: "Plugin not active" };
  const bed = await bedService.assignBed(
    req.params.wardId,
    req.body.patientId,
    req.body.encounterId,
  );
  if (!bed) {
    return { success: false, error: "No available beds in this ward" };
  }
  return { success: true, data: { bed } };
}

/**
 * POST /plugins/sample-bed-tracker/ward/:wardId/release
 * Release a bed when a patient is discharged or transferred.
 */
export async function releaseBed(req: {
  params: { wardId: string };
  body: { patientId: string };
}): Promise<unknown> {
  if (!bedService) return { error: "Plugin not active" };
  const bed = await bedService.releaseBed(
    req.params.wardId,
    req.body.patientId,
  );
  if (!bed) {
    return {
      success: false,
      error: "No occupied bed found for this patient in this ward",
    };
  }
  return { success: true, data: { bed } };
}
