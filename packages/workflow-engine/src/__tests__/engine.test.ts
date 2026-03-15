import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoClient, Db } from "mongodb";
import { WorkflowEngine } from "../engine";
import { PATIENT_ENCOUNTER_WORKFLOW } from "../definitions/patient-encounter.workflow";
import { Permission, UserRole } from "@hospital-cms/shared-types";

let client: MongoClient;
let db: Db;
let engine: WorkflowEngine;

const HOSPITAL_ID = "hosp-wf-test";
const ACTOR = {
  performedByUserId: "user-001",
  performedByUsername: "nurse1",
  performedByRole: UserRole.NURSE,
  permissions: [
    Permission.ENCOUNTER_READ,
    Permission.ENCOUNTER_UPDATE,
    Permission.ENCOUNTER_CREATE,
  ],
};

beforeAll(async () => {
  const uri = process.env["MONGODB_URI_TEST"] ?? "mongodb://localhost:27017";
  client = new MongoClient(uri);
  await client.connect();
  db = client.db("hospital_cms_wf_test");
  engine = new WorkflowEngine(db);

  await engine.seedDefinition(HOSPITAL_ID, {
    ...PATIENT_ENCOUNTER_WORKFLOW,
    createdBy: "system",
  });
});

afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

describe("WorkflowEngine — patient encounter", () => {
  let runId: string;
  const entityId = `enc-${Date.now()}`;

  it("starts a workflow run at initialStep", async () => {
    const run = await engine.startRun({
      hospitalId: HOSPITAL_ID,
      workflowName: "patient_encounter",
      entityType: "Encounter",
      entityId,
      startedBy: ACTOR.performedByUserId,
      startedByUsername: ACTOR.performedByUsername,
      startedByRole: ACTOR.performedByRole,
      traceId: "trace-001",
    });

    expect(run.currentStep).toBe("registered");
    expect(run.status).toBe("RUNNING");
    expect(run.history).toHaveLength(0);
    runId = run._id;
  });

  it("prevents duplicate active runs for same entity", async () => {
    await expect(
      engine.startRun({
        hospitalId: HOSPITAL_ID,
        workflowName: "patient_encounter",
        entityType: "Encounter",
        entityId,
        startedBy: ACTOR.performedByUserId,
        startedByUsername: ACTOR.performedByUsername,
        startedByRole: ACTOR.performedByRole,
        traceId: "trace-002",
      }),
    ).rejects.toThrow("active workflow run already exists");
  });

  it("transitions from registered → triage", async () => {
    const run = await engine.transition({
      runId,
      transitionId: "send_to_triage",
      ctx: ACTOR,
      hospitalId: HOSPITAL_ID,
      traceId: "trace-003",
    });

    expect(run.currentStep).toBe("triage");
    expect(run.history).toHaveLength(1);
    expect(run.history[0]!.transitionLabel).toBe("Send to Triage");
  });

  it("blocks triage → waiting_for_doctor when assignedDoctor missing", async () => {
    await expect(
      engine.transition({
        runId,
        transitionId: "triage_to_waiting",
        ctx: ACTOR,
        hospitalId: HOSPITAL_ID,
        traceId: "trace-004",
        entitySnapshot: {}, // no assignedDoctor field
      }),
    ).rejects.toThrow("Field 'assignedDoctor' must be set");
  });

  it("allows triage → waiting_for_doctor with assignedDoctor present", async () => {
    const run = await engine.transition({
      runId,
      transitionId: "triage_to_waiting",
      ctx: ACTOR,
      hospitalId: HOSPITAL_ID,
      traceId: "trace-005",
      entitySnapshot: { assignedDoctor: "dr-001" },
    });

    expect(run.currentStep).toBe("waiting_for_doctor");
  });

  it("transitions waiting → with_doctor", async () => {
    const run = await engine.transition({
      runId,
      transitionId: "doctor_sees_patient",
      ctx: {
        ...ACTOR,
        performedByRole: UserRole.DOCTOR,
        permissions: [Permission.ENCOUNTER_UPDATE],
      },
      hospitalId: HOSPITAL_ID,
      traceId: "trace-006",
    });
    expect(run.currentStep).toBe("with_doctor");
  });

  it("transitions with_doctor → billing", async () => {
    const run = await engine.transition({
      runId,
      transitionId: "doctor_to_billing",
      ctx: {
        ...ACTOR,
        performedByRole: UserRole.DOCTOR,
        permissions: [Permission.ENCOUNTER_UPDATE],
      },
      hospitalId: HOSPITAL_ID,
      traceId: "trace-007",
    });
    expect(run.currentStep).toBe("billing");
    expect(run.status).toBe("RUNNING");
  });

  it("terminates run on billing → discharged", async () => {
    const run = await engine.transition({
      runId,
      transitionId: "payment_complete_discharge",
      ctx: {
        ...ACTOR,
        performedByRole: UserRole.BILLING_STAFF,
        permissions: [Permission.BILLING_UPDATE],
      },
      hospitalId: HOSPITAL_ID,
      traceId: "trace-008",
    });

    expect(run.currentStep).toBe("discharged");
    expect(run.status).toBe("COMPLETED");
    expect(run.completedAt).toBeDefined();
  });

  it("blocks transition on completed run", async () => {
    await expect(
      engine.transition({
        runId,
        transitionId: "send_to_triage",
        ctx: ACTOR,
        hospitalId: HOSPITAL_ID,
        traceId: "trace-009",
      }),
    ).rejects.toThrow("not in RUNNING state");
  });

  it("returns available transitions for a step", async () => {
    // Start a fresh run for this test
    const freshEntityId = `enc-avail-${Date.now()}`;
    const run = await engine.startRun({
      hospitalId: HOSPITAL_ID,
      workflowName: "patient_encounter",
      entityType: "Encounter",
      entityId: freshEntityId,
      startedBy: ACTOR.performedByUserId,
      startedByUsername: ACTOR.performedByUsername,
      startedByRole: ACTOR.performedByRole,
      traceId: "trace-010",
    });

    const transitions = await engine.getAvailableTransitions(
      run._id,
      HOSPITAL_ID,
    );
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.some((t) => t.id === "send_to_triage")).toBe(true);
    expect(transitions.some((t) => t.id === "cancel_encounter")).toBe(true);
  });
});

describe("Guard evaluation", () => {
  it("field_required guard passes when field present", async () => {
    const { evaluateGuard } = await import("../guards.js");
    const result = evaluateGuard(
      { type: "field_required", config: { field: "assignedDoctor" } },
      { ...ACTOR, transitionId: "t1" },
      { assignedDoctor: "dr-001" },
    );
    expect(result.passed).toBe(true);
  });

  it("field_required guard fails when field absent", async () => {
    const { evaluateGuard } = await import("../guards.js");
    const result = evaluateGuard(
      { type: "field_required", config: { field: "assignedDoctor" } },
      { ...ACTOR, transitionId: "t1" },
      {},
    );
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain("assignedDoctor");
  });

  it("permission_check guard passes for correct role", async () => {
    const { evaluateGuard } = await import("../guards.js");
    const ctx = {
      ...ACTOR,
      transitionId: "t1",
      performedByRole: UserRole.HOSPITAL_ADMIN,
      permissions: [] as Permission[],
    };
    const result = evaluateGuard(
      {
        type: "permission_check",
        config: { permission: Permission.AUDIT_READ },
      },
      ctx,
    );
    expect(result.passed).toBe(true);
  });

  it("permission_check guard fails for insufficient role", async () => {
    const { evaluateGuard } = await import("../guards.js");
    const ctx = {
      ...ACTOR,
      transitionId: "t1",
      performedByRole: UserRole.READONLY,
      permissions: [] as Permission[],
    };
    const result = evaluateGuard(
      {
        type: "permission_check",
        config: { permission: Permission.AUDIT_EXPORT },
      },
      ctx,
    );
    expect(result.passed).toBe(false);
  });
});
