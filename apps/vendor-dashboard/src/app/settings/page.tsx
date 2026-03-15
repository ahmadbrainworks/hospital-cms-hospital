"use client";

import { useState } from "react";
import { Shell } from "../../components/Shell";
import { useAuth } from "@/lib/auth-context";
import { cpApi, ApiError } from "@/lib/api";

export default function SettingsPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setChanging(true);
    try {
      await cpApi.post("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setMsg("Password changed successfully. All other sessions have been revoked.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to change password.",
      );
    } finally {
      setChanging(false);
    }
  };

  return (
    <Shell>
      <div className="max-w-lg">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your account and preferences.
          </p>
        </div>

        {/* Account info */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Account Information
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex">
              <dt className="w-28 text-gray-500">Name</dt>
              <dd className="text-gray-900">{user?.displayName ?? "-"}</dd>
            </div>
            <div className="flex">
              <dt className="w-28 text-gray-500">Email</dt>
              <dd className="text-gray-900">{user?.email ?? "-"}</dd>
            </div>
            <div className="flex">
              <dt className="w-28 text-gray-500">Username</dt>
              <dd className="text-gray-900">{user?.username ?? "-"}</dd>
            </div>
            <div className="flex">
              <dt className="w-28 text-gray-500">Role</dt>
              <dd className="text-gray-900">
                {user?.role?.replace(/_/g, " ") ?? "-"}
              </dd>
            </div>
          </dl>
        </div>

        {/* Change password */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Change Password
          </h2>

          {msg && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-md px-3 py-2">
              {msg}
            </div>
          )}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={changing}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {changing ? "Changing..." : "Change Password"}
            </button>
          </form>
        </div>
      </div>
    </Shell>
  );
}
