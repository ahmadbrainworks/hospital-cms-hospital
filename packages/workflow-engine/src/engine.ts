import type { Db } from "mongodb";
import { COLLECTIONS } from "@hospital-cms/database";
import { AuditService } from "@hospital-cms/audit";
import {
  WorkflowTransitionError,
  NotFoundError,
  ForbiddenError,
} from "@hospital-cms/errors";
import { AuditAction, WorkflowRunStatus } from "@hospital-cms/shared-types";
import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunHistoryEntry,
} from "@hospital-cms/shared-types";
import type { TransitionContext } from "./types";
import { evaluateAllGuards } from "./guards";
import { logger } from "@hospital-cms/logger";
import { ObjectId } from "mongodb";

const log = logger("workflow:engine");

type WorkflowDefinitionDoc = Omit<WorkflowDefinition, "_id"> & {
  _id?: ObjectId;
};
type WorkflowRunDoc = Omit<WorkflowRun, "_id"> & { _id?: ObjectId };

// WORKFLOW RUNTIME ENGINE
// Loads definitions, validates transitions, persists run state,
// and emits audit events on every step.

export class WorkflowEngine {
  private readonly db: Db;
  private readonly auditService: AuditService;
  private readonly defColl;
  private readonly runColl;

  constructor(db: Db) {
    this.db = db;
    this.auditService = new AuditService(db);
    this.defColl = db.collection<WorkflowDefinitionDoc>(
      COLLECTIONS.WORKFLOW_DEFINITIONS,
    );
    this.runColl = db.collection<WorkflowRunDoc>(COLLECTIONS.WORKFLOW_RUNS);
  }

  //  Start a new workflow run
  async startRun(params: {
    hospitalId: string;
    workflowName: string;
    entityType: string;
    entityId: string;
    startedBy: string;
    startedByUsername: string;
    startedByRole: string;
    traceId: string;
    metadata?: Record<string, unknown>;
  }): Promise<WorkflowRun & { _id: string }> {
    const def = await this.defColl.findOne({
      hospitalId: params.hospitalId,
      name: params.workflowName,
      isActive: true,
    });

    if (!def) {
      throw new NotFoundError(`Workflow definition '${params.workflowName}'`);
    }

    // Prevent duplicate active run for same entity
    const existing = await this.runColl.findOne({
      hospitalId: params.hospitalId,
      entityType: params.entityType,
      entityId: params.entityId,
      status: WorkflowRunStatus.RUNNING,
    });

    if (existing) {
      throw new WorkflowTransitionError(
        `An active workflow run already exists for ${params.entityType}:${params.entityId}`,
      );
    }

    const now = new Date();
    const runDoc: Omit<WorkflowRunDoc, "_id"> = {
      hospitalId: params.hospitalId,
      workflowId: String(def._id),
      entityType: params.entityType,
      entityId: params.entityId,
      status: WorkflowRunStatus.RUNNING,
      currentStep: def.initialStep,
      history: [],
      metadata: params.metadata ?? {},
      startedAt: now,
      startedBy: params.startedBy,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.runColl.insertOne(
      runDoc as Omit<WorkflowRunDoc, "_id">,
    );
    const run = await this.runColl.findOne({ _id: result.insertedId });

    await this.auditService.log({
      hospitalId: params.hospitalId,
      traceId: params.traceId,
      action: AuditAction.WORKFLOW_STARTED,
      actor: {
        userId: params.startedBy,
        username: params.startedByUsername,
        role: params.startedByRole as import("@hospital-cms/shared-types").UserRole,
      },
      resource: { type: params.entityType, id: params.entityId },
      outcome: "SUCCESS",
      metadata: {
        workflowName: params.workflowName,
        initialStep: def.initialStep,
        runId: result.insertedId.toHexString(),
      },
    });

    log.info(
      {
        runId: result.insertedId.toHexString(),
        workflow: params.workflowName,
        entityId: params.entityId,
      },
      "Workflow run started",
    );

    return { ...run!, _id: result.insertedId.toHexString() } as WorkflowRun & {
      _id: string;
    };
  }

  //  Execute a transition
  async transition(params: {
    runId: string;
    transitionId: string;
    ctx: TransitionContext;
    hospitalId: string;
    traceId: string;
    entitySnapshot?: Record<string, unknown>;
  }): Promise<WorkflowRun & { _id: string }> {
    const run = await this.runColl.findOne({
      _id: new ObjectId(params.runId),
      hospitalId: params.hospitalId,
    });

    if (!run) throw new NotFoundError("WorkflowRun", params.runId);
    if (run.status !== WorkflowRunStatus.RUNNING) {
      throw new WorkflowTransitionError(
        `Workflow run is not in RUNNING state (current: ${run.status})`,
      );
    }

    const def = await this.defColl.findOne({
      _id: new ObjectId(run.workflowId),
    });
    if (!def) throw new NotFoundError("WorkflowDefinition", run.workflowId);

    const currentStepDef = (
      def.steps as import("./types.js").WorkflowStepDef[]
    ).find((s) => s.id === run.currentStep);
    if (!currentStepDef) {
      throw new WorkflowTransitionError(
        `Step '${run.currentStep}' not found in workflow definition`,
      );
    }

    const transitionDef = currentStepDef.transitions.find(
      (t) => t.id === params.transitionId,
    );
    if (!transitionDef) {
      throw new WorkflowTransitionError(
        `Transition '${params.transitionId}' is not available from step '${run.currentStep}'`,
      );
    }

    // Evaluate guards
    const guardResult = evaluateAllGuards(
      transitionDef.guards,
      params.ctx,
      params.entitySnapshot,
    );
    if (!guardResult.passed) {
      const auditEvent = {
        hospitalId: params.hospitalId,
        traceId: params.traceId,
        action: AuditAction.WORKFLOW_TRANSITION,
        actor: {
          userId: params.ctx.performedByUserId,
          username: params.ctx.performedByUsername,
          role: params.ctx
            .performedByRole as import("@hospital-cms/shared-types").UserRole,
        },
        resource: { type: "WorkflowRun", id: params.runId },
        outcome: "FAILURE",
        ...(guardResult.failureReason !== undefined && {
          failureReason: guardResult.failureReason,
        }),
      } satisfies Parameters<AuditService["log"]>[0];

      await this.auditService.log(auditEvent);
      throw new WorkflowTransitionError(
        guardResult.failureReason ?? "Transition guard failed",
      );
    }

    // Check required permission on transition
    if (transitionDef.requiredPermissions.length > 0) {
      const permCtx = {
        userId: params.ctx.performedByUserId,
        role: params.ctx
          .performedByRole as import("@hospital-cms/shared-types").UserRole,
        permissions: params.ctx.permissions,
      };
      for (const p of transitionDef.requiredPermissions) {
        const { hasPermission } = await import("@hospital-cms/rbac");
        if (!hasPermission(permCtx, p)) {
          throw new ForbiddenError(
            `Permission '${p}' required for transition '${transitionDef.label}'`,
          );
        }
      }
    }

    const now = new Date();
    const historyEntry: WorkflowRunHistoryEntry = {
      step: run.currentStep,
      transitionId: transitionDef.id,
      transitionLabel: transitionDef.label,
      performedBy: params.ctx.performedByUserId,
      performedAt: now,
      ...(params.ctx.notes !== undefined && { notes: params.ctx.notes }),
    };

    const newStatus = transitionDef.isTerminal
      ? WorkflowRunStatus.COMPLETED
      : WorkflowRunStatus.RUNNING;

    await this.runColl.updateOne(
      { _id: new ObjectId(params.runId) },
      {
        $set: {
          currentStep: transitionDef.targetStep,
          status: newStatus,
          updatedAt: now,
          ...(newStatus === WorkflowRunStatus.COMPLETED && {
            completedAt: now,
          }),
        },
        $push: { history: historyEntry },
      },
    );

    await this.auditService.log({
      hospitalId: params.hospitalId,
      traceId: params.traceId,
      action: transitionDef.isTerminal
        ? AuditAction.WORKFLOW_COMPLETED
        : AuditAction.WORKFLOW_TRANSITION,
      actor: {
        userId: params.ctx.performedByUserId,
        username: params.ctx.performedByUsername,
        role: params.ctx
          .performedByRole as import("@hospital-cms/shared-types").UserRole,
      },
      resource: { type: "WorkflowRun", id: params.runId },
      outcome: "SUCCESS",
      metadata: {
        fromStep: run.currentStep,
        toStep: transitionDef.targetStep,
        transitionLabel: transitionDef.label,
        isTerminal: transitionDef.isTerminal,
      },
    });

    log.info(
      {
        runId: params.runId,
        from: run.currentStep,
        to: transitionDef.targetStep,
        terminal: transitionDef.isTerminal,
      },
      "Workflow transition executed",
    );

    const updated = await this.runColl.findOne({
      _id: new ObjectId(params.runId),
    });
    return { ...updated!, _id: params.runId } as WorkflowRun & { _id: string };
  }

  //  Get active run for an entity
  async getActiveRun(
    hospitalId: string,
    entityType: string,
    entityId: string,
  ): Promise<(WorkflowRun & { _id: string }) | null> {
    const run = await this.runColl.findOne({
      hospitalId,
      entityType,
      entityId,
      status: WorkflowRunStatus.RUNNING,
    });
    if (!run) return null;
    return { ...run, _id: String(run._id) } as WorkflowRun & { _id: string };
  }

  //  Get available transitions from current step
  async getAvailableTransitions(
    runId: string,
    hospitalId: string,
  ): Promise<import("./types.js").WorkflowTransitionDef[]> {
    const run = await this.runColl.findOne({
      _id: new ObjectId(runId),
      hospitalId,
    });
    if (!run) throw new NotFoundError("WorkflowRun", runId);

    const def = await this.defColl.findOne({
      _id: new ObjectId(run.workflowId),
    });
    if (!def) return [];

    const step = (def.steps as import("./types.js").WorkflowStepDef[]).find(
      (s) => s.id === run.currentStep,
    );
    return step?.transitions ?? [];
  }

  //  Seed workflow definitions
  async seedDefinition(
    hospitalId: string,
    def: import("./types.js").WorkflowDefinitionDef & { createdBy: string },
  ): Promise<void> {
    const existing = await this.defColl.findOne({
      hospitalId,
      name: def.name,
      version: def.version,
    });
    if (existing) {
      log.debug(
        { name: def.name, version: def.version },
        "Workflow definition already seeded",
      );
      return;
    }

    const now = new Date();
    await this.defColl.insertOne({
      hospitalId,
      name: def.name,
      version: def.version,
      description: def.description,
      steps: def.steps as WorkflowDefinition["steps"],
      initialStep: def.initialStep,
      isActive: true,
      createdBy: def.createdBy,
      createdAt: now,
      updatedAt: now,
    } as Omit<WorkflowDefinitionDoc, "_id">);

    log.info(
      { name: def.name, version: def.version },
      "Workflow definition seeded",
    );
  }
}
