import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { sendSuccess } from "../helpers/response";
import { Permission } from "@hospital-cms/shared-types";
import { COLLECTIONS } from "@hospital-cms/database";
import { WorkflowEngine } from "@hospital-cms/workflow-engine";
import { ValidationError } from "@hospital-cms/errors";

const TransitionSchema = z.object({
  transitionId: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});

const StartSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  definitionId: z.string().min(1),
});

export function workflowRouter(db: Db): Router {
  const router = Router();
  const runCollection = db.collection(COLLECTIONS.WORKFLOW_RUNS);
  const defCollection = db.collection(COLLECTIONS.WORKFLOW_DEFINITIONS);
  const engine = new WorkflowEngine(db);

  router.use(authenticate);

  // GET /workflows/definitions
  router.get(
    "/definitions",
    requirePermission(Permission.WORKFLOW_READ),
    async (req, res, next) => {
      try {
        const defs = await defCollection
          .find({ hospitalId: req.context.hospitalId!, isActive: true })
          .toArray();
        sendSuccess(
          res,
          defs.map((d) => ({ ...d, _id: d["_id"].toHexString() })),
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /workflows/runs — start a workflow run
  router.post(
    "/runs",
    requirePermission(Permission.WORKFLOW_ADMIN),
    async (req, res, next) => {
      try {
        const body = StartSchema.parse(req.body);
        const run = await engine.startRun({
          hospitalId: req.context.hospitalId!,
          workflowName: body.definitionId,
          entityType: body.entityType,
          entityId: body.entityId,
          startedBy: req.context.userId!,
          startedByUsername: req.context.username!,
          startedByRole: req.context.role!,
          traceId: req.context.traceId,
        });
        sendSuccess(res, run, 201, undefined, req.context.traceId);
      } catch (err) {
        if (err instanceof z.ZodError)
          return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  // GET /workflows/runs/:entityType/:entityId — active run for entity
  router.get(
    "/runs/:entityType/:entityId",
    requirePermission(Permission.WORKFLOW_READ),
    async (req, res, next) => {
      try {
        const run = await engine.getActiveRun(
          req.context.hospitalId!,
          req.params["entityType"]!,
          req.params["entityId"]!,
        );

        let availableTransitions: unknown[] = [];
        if (run) {
          availableTransitions = await engine.getAvailableTransitions(
            run._id,
            req.context.hospitalId!,
          );
        }

        sendSuccess(
          res,
          run ? { ...run, availableTransitions } : null,
          200,
          undefined,
          req.context.traceId,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /workflows/runs/:runId/transition — advance workflow
  router.post(
    "/runs/:runId/transition",
    requirePermission(Permission.WORKFLOW_ADMIN),
    async (req, res, next) => {
      try {
        const body = TransitionSchema.parse(req.body);
        const run = await runCollection.findOne({
          _id: req.params["runId"] as any,
          hospitalId: req.context.hospitalId!,
        });
        if (!run) return next(new ValidationError("Workflow run not found"));

        const updated = await engine.transition({
          runId: req.params["runId"]!,
          transitionId: body.transitionId,
          hospitalId: req.context.hospitalId!,
          traceId: req.context.traceId,
          ctx: {
            transitionId: body.transitionId,
            performedByUserId: req.context.userId!,
            performedByUsername: req.context.username!,
            performedByRole: req.context.role!,
            permissions: [],
          },
        });
        sendSuccess(res, updated, 200, undefined, req.context.traceId);
      } catch (err) {
        if (err instanceof z.ZodError)
          return next(new ValidationError(err.message));
        next(err);
      }
    },
  );

  return router;
}
