"use client";

import useSWR from "swr";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api-client";
import { hasPermission } from "../../lib/permissions";
import { Permission } from "@hospital-cms/shared-types";

// DASHBOARD HOME
// Overview metrics, quick actions, and recent activity.

const fetcher = (url: string): Promise<any> => api.get(url).then((r) => r.data);

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const canReadPatients = user
    ? hasPermission(user, Permission.PATIENT_READ)
    : false;
  const canReadBilling = user
    ? hasPermission(user, Permission.BILLING_READ)
    : false;

  const { data: patientsData } = useSWR(
    canReadPatients ? "/api/v1/patients?limit=1" : null,
    fetcher,
  );
  const { data: encountersData } = useSWR(
    canReadPatients ? "/api/v1/encounters?limit=1" : null,
    fetcher,
  );

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="p-6 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting()}, {user?.profile.firstName}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {canReadPatients && (
          <>
            <StatCard
              label="Total Patients"
              value={
                (patientsData as { meta?: { total?: number } } | undefined)
                  ?.meta?.total ?? "—"
              }
              color="bg-blue-50"
              icon="👤"
            />
            <StatCard
              label="Active Encounters"
              value={
                (encountersData as { meta?: { total?: number } } | undefined)
                  ?.meta?.total ?? "—"
              }
              color="bg-green-50"
              icon="🏥"
            />
          </>
        )}
        {canReadBilling && (
          <>
            <StatCard
              label="Pending Invoices"
              value="—"
              color="bg-orange-50"
              icon="💳"
            />
            <StatCard
              label="Today's Revenue"
              value="—"
              color="bg-purple-50"
              icon="💰"
            />
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {canReadPatients && (
            <a
              href="/patients/new"
              className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors text-center"
            >
              <span className="text-2xl">➕</span>
              <span className="text-xs font-medium text-gray-700">
                Register Patient
              </span>
            </a>
          )}
          <a
            href="/encounters/new"
            className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors text-center"
          >
            <span className="text-2xl">🏥</span>
            <span className="text-xs font-medium text-gray-700">
              New Encounter
            </span>
          </a>
          {canReadBilling && (
            <a
              href="/billing/new"
              className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-colors text-center"
            >
              <span className="text-2xl">📄</span>
              <span className="text-xs font-medium text-gray-700">
                Create Invoice
              </span>
            </a>
          )}
          <a
            href="/lab/orders/new"
            className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-colors text-center"
          >
            <span className="text-2xl">🔬</span>
            <span className="text-xs font-medium text-gray-700">Lab Order</span>
          </a>
        </div>
      </div>

      {/* Role-specific info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-sm text-blue-700">
          <strong>Role:</strong> {user?.role} — You have access to{" "}
          {user?.role === "SUPER_ADMIN" ? "all" : "authorized"} sections of this
          system.
        </p>
      </div>
    </div>
  );
}
