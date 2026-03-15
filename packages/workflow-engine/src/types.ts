import type { Permission } from "@hospital-cms/shared-types";

// WORKFLOW ENGINE TYPES

export interface WorkflowStepDef {
  id: string;
  name: string;
  description?: string;
  transitions: WorkflowTransitionDef[];
  requiredPermissions: Permission[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowTransitionDef {
  id: string;
  label: string;
  targetStep: string;
  guards: GuardDef[];
  requiredPermissions: Permission[];
  isTerminal: boolean;
}

export interface GuardDef {
  type: "field_required" | "permission_check" | "entity_field_truthy";
  config: Record<string, unknown>;
}

export interface WorkflowDefinitionDef {
  name: string;
  version: number;
  description: string;
  steps: WorkflowStepDef[];
  initialStep: string;
}

export interface TransitionContext {
  transitionId: string;
  performedByUserId: string;
  performedByUsername: string;
  performedByRole: string;
  permissions: Permission[];
  notes?: string;
  entitySnapshot?: Record<string, unknown>;
}

export interface GuardResult {
  passed: boolean;
  failureReason?: string;
}
