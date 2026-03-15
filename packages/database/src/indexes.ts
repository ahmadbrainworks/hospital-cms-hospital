import { Db, IndexDescription, IndexSpecification } from "mongodb";
import { COLLECTIONS } from "./collections";
import { logger } from "@hospital-cms/logger";

// INDEX DEFINITIONS
// Run once on startup or schema migration.
// idempotent — uses createIndex (MongoDB deduplicates by spec).

type DatabaseLogger = {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

let _log: DatabaseLogger | null = null;

function getLog(): DatabaseLogger {
  if (_log) {
    return _log;
  }

  try {
    _log = logger("database:indexes");
  } catch {
    _log = {
      debug: (obj, msg) =>
        console.debug("[database:indexes]", msg ?? obj, msg ? obj : ""),
      info: (obj, msg) =>
        console.info("[database:indexes]", msg ?? obj, msg ? obj : ""),
      warn: (obj, msg) =>
        console.warn("[database:indexes]", msg ?? obj, msg ? obj : ""),
      error: (obj, msg) =>
        console.error("[database:indexes]", msg ?? obj, msg ? obj : ""),
    };
  }

  return _log;
}

const INDEX_DEFINITIONS: Record<string, IndexDescription[]> = {
  [COLLECTIONS.USERS]: [
    { key: { email: 1 }, unique: true, name: "users_email_unique" },
    { key: { username: 1 }, unique: true, name: "users_username_unique" },
    { key: { hospitalId: 1 }, name: "users_hospitalId" },
    { key: { hospitalId: 1, role: 1 }, name: "users_hospitalId_role" },
    { key: { isActive: 1 }, name: "users_isActive" },
    {
      key: { deletedAt: 1 },
      sparse: true,
      name: "users_deletedAt_sparse",
    },
  ],

  [COLLECTIONS.HOSPITAL_INSTANCE]: [
    {
      key: { instanceId: 1 },
      unique: true,
      name: "instance_instanceId_unique",
    },
    {
      key: { slug: 1 },
      unique: true,
      name: "instance_slug_unique",
    },
  ],

  [COLLECTIONS.PATIENTS]: [
    {
      key: { hospitalId: 1, patientNumber: 1 },
      unique: true,
      name: "patients_hospitalId_patientNumber_unique",
    },
    {
      key: { hospitalId: 1, mrn: 1 },
      unique: true,
      name: "patients_hospitalId_mrn_unique",
    },
    {
      key: { hospitalId: 1, "profile.lastName": 1, "profile.firstName": 1 },
      name: "patients_name",
    },
    {
      key: { hospitalId: 1, status: 1 },
      name: "patients_status",
    },
    {
      key: { hospitalId: 1, "profile.nationalId": 1 },
      sparse: true,
      name: "patients_nationalId",
    },
    {
      key: { deletedAt: 1 },
      sparse: true,
      name: "patients_deletedAt_sparse",
    },
    {
      key: {
        "profile.firstName": "text",
        "profile.lastName": "text",
        "profile.nationalId": "text",
        "contactInfo.phone": "text",
      },
      name: "patients_text_search",
    },
  ],

  [COLLECTIONS.ENCOUNTERS]: [
    {
      key: { hospitalId: 1, encounterNumber: 1 },
      unique: true,
      name: "encounters_number_unique",
    },
    {
      key: { hospitalId: 1, patientId: 1 },
      name: "encounters_patient",
    },
    {
      key: { hospitalId: 1, status: 1 },
      name: "encounters_status",
    },
    {
      key: { hospitalId: 1, admittedAt: -1 },
      name: "encounters_admittedAt",
    },
    {
      key: { hospitalId: 1, assignedDoctor: 1 },
      name: "encounters_doctor",
    },
  ],

  [COLLECTIONS.INVOICES]: [
    {
      key: { hospitalId: 1, invoiceNumber: 1 },
      unique: true,
      name: "invoices_number_unique",
    },
    { key: { hospitalId: 1, patientId: 1 }, name: "invoices_patient" },
    { key: { hospitalId: 1, status: 1 }, name: "invoices_status" },
    { key: { hospitalId: 1, createdAt: -1 }, name: "invoices_date" },
    { key: { encounterId: 1 }, sparse: true, name: "invoices_encounter" },
  ],

  [COLLECTIONS.LAB_ORDERS]: [
    {
      key: { hospitalId: 1, orderNumber: 1 },
      unique: true,
      name: "laborders_number_unique",
    },
    { key: { hospitalId: 1, patientId: 1 }, name: "laborders_patient" },
    { key: { hospitalId: 1, status: 1 }, name: "laborders_status" },
    { key: { encounterId: 1 }, name: "laborders_encounter" },
  ],

  [COLLECTIONS.PRESCRIPTIONS]: [
    {
      key: { hospitalId: 1, prescriptionNumber: 1 },
      unique: true,
      name: "prescriptions_number_unique",
    },
    {
      key: { hospitalId: 1, patientId: 1 },
      name: "prescriptions_patient",
    },
    {
      key: { encounterId: 1 },
      name: "prescriptions_encounter",
    },
  ],

  [COLLECTIONS.WORKFLOW_DEFINITIONS]: [
    {
      key: { hospitalId: 1, name: 1, version: -1 },
      name: "workflows_name_version",
    },
    {
      key: { hospitalId: 1, isActive: 1 },
      name: "workflows_active",
    },
  ],

  [COLLECTIONS.WORKFLOW_RUNS]: [
    {
      key: { hospitalId: 1, entityType: 1, entityId: 1 },
      name: "workflowruns_entity",
    },
    { key: { hospitalId: 1, status: 1 }, name: "workflowruns_status" },
    { key: { workflowId: 1 }, name: "workflowruns_workflow" },
  ],

  [COLLECTIONS.PLUGIN_REGISTRY]: [
    {
      key: { hospitalId: 1, pluginId: 1 },
      unique: true,
      name: "plugins_hospitalId_pluginId_unique",
    },
    { key: { status: 1 }, name: "plugins_status" },
  ],

  [COLLECTIONS.THEME_ASSIGNMENTS]: [
    {
      key: { hospitalId: 1 },
      unique: true,
      name: "themes_hospitalId_unique",
    },
  ],

  [COLLECTIONS.AUDIT_LOGS]: [
    { key: { hospitalId: 1, createdAt: -1 }, name: "audit_hospitalId_date" },
    { key: { hospitalId: 1, action: 1 }, name: "audit_action" },
    {
      key: { hospitalId: 1, "actor.userId": 1 },
      name: "audit_actor",
    },
    {
      key: { hospitalId: 1, "resource.type": 1, "resource.id": 1 },
      name: "audit_resource",
    },
    { key: { traceId: 1 }, name: "audit_traceId" },
  ],

  [COLLECTIONS.LICENSES]: [
    {
      key: { licenseId: 1 },
      unique: true,
      name: "licenses_licenseId_unique",
    },
    {
      key: { instanceId: 1 },
      unique: true,
      name: "licenses_instanceId_unique",
    },
    { key: { expiresAt: 1 }, name: "licenses_expiresAt" },
  ],

  [COLLECTIONS.OPERATIONAL_COMMANDS]: [
    {
      key: { commandId: 1 },
      unique: true,
      name: "commands_commandId_unique",
    },
    { key: { instanceId: 1, status: 1 }, name: "commands_instance_status" },
    { key: { nonce: 1 }, unique: true, name: "commands_nonce_unique" },
    {
      key: { expiresAt: 1 },
      expireAfterSeconds: 0,
      name: "commands_ttl",
    },
  ],

  [COLLECTIONS.SESSIONS]: [
    { key: { userId: 1 }, name: "sessions_userId" },
    { key: { token: 1 }, unique: true, name: "sessions_token_unique" },
    {
      key: { expiresAt: 1 },
      expireAfterSeconds: 0,
      name: "sessions_ttl",
    },
  ],

  [COLLECTIONS.NETWORK_ADVISORIES]: [
    { key: { instanceId: 1, isActive: 1 }, name: "advisories_instance_active" },
    { key: { generatedAt: -1 }, name: "advisories_date" },
  ],

  [COLLECTIONS.COUNTER_SEQUENCES]: [
    {
      key: { hospitalId: 1, name: 1 },
      unique: true,
      name: "sequences_unique",
    },
  ],

  [COLLECTIONS.LICENSE_LEASES]: [
    { key: { instanceId: 1 }, unique: true, name: "lease_instanceId_unique" },
    // TTL index — MongoDB auto-removes expired leases after ~60s of expiry
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "lease_ttl" },
  ],

  [COLLECTIONS.INSTALLED_PACKAGES]: [
    { key: { instanceId: 1, packageId: 1 }, unique: true, name: "pkg_instance_package_unique" },
    { key: { instanceId: 1, status: 1 }, name: "pkg_instance_status" },
  ],
};

export async function ensureIndexes(db: Db): Promise<void> {
  const log = getLog();
  const tasks: Promise<void>[] = [];

  for (const [collectionName, indexes] of Object.entries(INDEX_DEFINITIONS)) {
    const task = (async () => {
      const collection = db.collection(collectionName);
      for (const index of indexes) {
        try {
          const options = {
            ...(index.unique && { unique: true }),
            ...(index.sparse && { sparse: true }),
            ...(index.expireAfterSeconds !== undefined && {
              expireAfterSeconds: index.expireAfterSeconds,
            }),
            ...(index.name !== undefined && { name: index.name }),
            background: true,
          };

          await collection.createIndex(
            index.key as IndexSpecification,
            options,
          );
        } catch (err) {
          log.warn(
            { err, collection: collectionName, index: index.name },
            "Index creation warning",
          );
        }
      }
      log.debug({ collection: collectionName }, "Indexes ensured");
    })();
    tasks.push(task);
  }

  await Promise.all(tasks);
  log.info("All database indexes ensured");
}
