"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";
import { Permission } from "@hospital-cms/shared-types";

interface WorkflowDefinition {
  _id: string;
  name: string;
  description: string;
  entityType: string;
  steps: Array<{ id: string; name: string; isTerminal?: boolean }>;
  isActive: boolean;
}

interface WorkflowRun {
  _id: string;
  definitionId: string;
  entityType: string;
  entityId: string;
  currentStepId: string;
  status: string;
  startedAt: string;
  availableTransitions: Array<{ id: string; label: string; toStepId: string }>;
}

const fetcher = (url: string): Promise<any> => api.get<unknown>(url).then((r) => r.data);

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    RUNNING: "bg-blue-100 text-blue-800",
    COMPLETED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
}

function WorkflowRunCard({
  run,
  onTransition,
}: {
  run: WorkflowRun;
  onTransition: (runId: string, transitionId: string) => void;
}) {
  const { user } = useAuth();
  const canManage = user
    ? hasPermission(user, Permission.WORKFLOW_ADMIN)
    : false;

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {run.entityType} /{" "}
            <span className="font-mono text-xs">{run.entityId}</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Started {new Date(run.startedAt).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={run.status} />
      </div>

      <div className="mb-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
          Current Step
        </p>
        <p className="text-sm font-semibold text-indigo-700">
          {run.currentStepId}
        </p>
      </div>

      {canManage &&
        run.status === "RUNNING" &&
        run.availableTransitions.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
              Available Actions
            </p>
            <div className="flex flex-wrap gap-2">
              {run.availableTransitions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onTransition(run._id, t.id)}
                  className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

export default function WorkflowsPage() {
  const { data: definitions } = useSWR<WorkflowDefinition[]>(
    "/api/v1/workflows/definitions",
    fetcher,
  );
  const [selectedEntity, setSelectedEntity] = useState({
    type: "encounter",
    id: "",
  });
  const [runData, setRunData] = useState<WorkflowRun | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [message, setMessage] = useState("");

  const lookupRun = async () => {
    if (!selectedEntity.id.trim()) return;
    setLookupError("");
    try {
      const res = await api.get<WorkflowRun | null>(
        `/api/v1/workflows/runs/${selectedEntity.type}/${selectedEntity.id}`,
      );
      setRunData(res.data);
      if (!res.data)
        setLookupError("No active workflow run found for this entity.");
    } catch {
      setLookupError("Failed to look up workflow run.");
    }
  };

  const handleTransition = async (runId: string, transitionId: string) => {
    setTransitioning(true);
    setMessage("");
    try {
      await api.post(`/api/v1/workflows/runs/${runId}/transition`, {
        transitionId,
      });
      setMessage("Transition applied successfully.");
      // Refresh
      await lookupRun();
    } catch (err: any) {
      setMessage(err?.message ?? "Transition failed.");
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Workflows</h1>

      {/* Definitions */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">
          Active Definitions
        </h2>
        {!definitions ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : definitions.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No workflow definitions found.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {definitions.map((def) => (
              <div
                key={def._id}
                className="bg-white border rounded-lg p-4 shadow-sm"
              >
                <p className="font-medium text-gray-900">{def.name}</p>
                <p className="text-xs text-gray-500 mt-1">{def.description}</p>
                <p className="text-xs text-indigo-600 mt-2">
                  Entity: {def.entityType} · {def.steps.length} steps
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Run lookup */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">
          Workflow Run Status
        </h2>
        <div className="bg-white border rounded-lg p-4 shadow-sm mb-4">
          <div className="flex gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Entity Type
              </label>
              <select
                value={selectedEntity.type}
                onChange={(e) =>
                  setSelectedEntity((prev) => ({
                    ...prev,
                    type: e.target.value,
                  }))
                }
                className="border rounded-md px-2 py-1.5 text-sm"
              >
                <option value="encounter">Encounter</option>
                <option value="patient">Patient</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">
                Entity ID
              </label>
              <input
                value={selectedEntity.id}
                onChange={(e) =>
                  setSelectedEntity((prev) => ({ ...prev, id: e.target.value }))
                }
                placeholder="e.g. ENC-2026-000001"
                className="w-full border rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={lookupRun}
              className="bg-indigo-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-indigo-700"
            >
              Look Up
            </button>
          </div>
          {lookupError && (
            <p className="text-red-600 text-sm mt-2">{lookupError}</p>
          )}
        </div>

        {message && (
          <p
            className={`text-sm mb-3 ${message.includes("success") ? "text-green-600" : "text-red-600"}`}
          >
            {message}
          </p>
        )}

        {runData && (
          <WorkflowRunCard run={runData} onTransition={handleTransition} />
        )}
      </section>
    </div>
  );
}
