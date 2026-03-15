"use client";

import { useState } from "react";
import useSWR from "swr";
import { cpApi, ApiError } from "@/lib/api";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/lib/auth-context";
import { P } from "@/lib/permissions";

interface StaffMember {
  staffId: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLES = [
  "VENDOR_SUPER_ADMIN",
  "LICENSE_MANAGER",
  "INSTANCE_MANAGER",
  "SUPPORT_STAFF",
  "PACKAGE_MANAGER",
  "AUDITOR",
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  disabled: "bg-gray-100 text-gray-600",
  locked: "bg-red-100 text-red-700",
};

export default function StaffPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(P.STAFF_CREATE);
  const canUpdate = hasPermission(P.STAFF_UPDATE);

  const { data, error, isLoading, mutate } = useSWR(
    "/api/vendor/staff",
    (url: string): Promise<any> => cpApi.get(url),
  );

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: "",
    username: "",
    displayName: "",
    password: "",
    role: "SUPPORT_STAFF",
  });
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMsg("");
    try {
      await cpApi.post("/api/vendor/staff", form);
      setMsg("Staff account created.");
      setForm({ email: "", username: "", displayName: "", password: "", role: "SUPPORT_STAFF" });
      setShowCreate(false);
      mutate();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Failed to create.");
    } finally {
      setCreating(false);
    }
  };

  const unlock = async (staffId: string) => {
    try {
      await cpApi.post(`/api/vendor/staff/${staffId}/unlock`);
      mutate();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed");
    }
  };

  const staff: StaffMember[] = data?.data ?? [];

  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Staff</h1>
          <p className="text-sm text-gray-500 mt-1">Manage vendor control panel staff accounts.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {showCreate ? "Cancel" : "Add Staff"}
          </button>
        )}
      </div>

      {msg && (
        <div className={`mb-4 text-sm rounded-md px-3 py-2 ${msg.includes("created") ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"} border`}>
          {msg}
        </div>
      )}

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Create Staff Account</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input type="text" required value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
              <input type="text" required value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <button type="submit" disabled={creating} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {creating ? "Creating..." : "Create Account"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading && <div className="text-sm text-gray-400">Loading...</div>}
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error.message}</div>}

      {staff.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                {canUpdate && <th className="px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {staff.map((s) => (
                <tr key={s.staffId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.displayName}</td>
                  <td className="px-4 py-3 text-gray-600">{s.email}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.role.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : "Never"}
                  </td>
                  {canUpdate && (
                    <td className="px-4 py-3">
                      {s.status === "locked" && (
                        <button onClick={() => unlock(s.staffId)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">
                          Unlock
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
