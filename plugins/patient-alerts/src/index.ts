/**
 * patient-alerts — Hospital CMS Example Plugin
 *
 * Demonstrates:
 *  - Plugin lifecycle (activate / deactivate)
 *  - Sandboxed storage API (scoped to plugin + hospital)
 *  - Isolated event bus (subscribe / emit)
 *  - Plugin-scoped logger
 *  - Declarative route handlers
 *
 * Raises alerts for:
 *  - Critical lab results
 *  - Allergy-medication conflicts
 *  - Overdue admission assessments
 */
import type { PluginApi as PluginSandbox } from "@hospital-cms/plugin-runtime";
import { AlertService } from "./alert-service";
import { registerHandlers } from "./handlers";
import type { PluginConfig } from "./types";

let alertService: AlertService | null = null;
const subscriptionIds: string[] = [];

/**
 * Called by the PluginRegistry when the plugin is activated.
 * The sandbox provides scoped storage, a logger, an event bus,
 * and assertPermission for declaring API access.
 */
export async function activate(sandbox: PluginSandbox): Promise<void> {
  sandbox.log.info("patient-alerts plugin activating");

  // Read config from manifest (with defaults)
  const config: PluginConfig = {
    criticalLabThreshold:
      String((await sandbox.storage.get("config:criticalLabThreshold")) ?? "CRITICAL"),
    allergyCheckEnabled:
      String(await sandbox.storage.get("config:allergyCheckEnabled")) !== "false",
    overdueAssessmentHours: parseInt(
      String((await sandbox.storage.get("config:overdueAssessmentHours")) ?? "24"),
      10,
    ),
  };

  alertService = new AlertService(sandbox, config);
  const handlers = registerHandlers(alertService, config);

  sandbox.log.info(`patient-alerts plugin activated. subscribedEvents=${Object.keys(handlers).join(",")}`);
}

/**
 * Called by the PluginRegistry on deactivate / shutdown.
 * Must clean up subscriptions.
 */
export async function deactivate(sandbox: PluginSandbox): Promise<void> {
  alertService = null;
  sandbox.log.info("patient-alerts plugin deactivated");
}

//  Route handlers (registered via manifest.routes)

/** GET /plugins/patient-alerts/alerts */
export async function listAlerts(_req: unknown): Promise<unknown> {
  if (!alertService) return { alerts: [], error: "Plugin not active" };
  const alerts = await alertService.getActiveAlerts();
  return { alerts };
}

/** GET /plugins/patient-alerts/alerts/:patientId */
export async function getPatientAlerts(req: {
  params: { patientId: string };
}): Promise<unknown> {
  if (!alertService) return { alerts: [], error: "Plugin not active" };
  const alerts = await alertService.getAlertsForPatient(req.params.patientId);
  return { alerts };
}
