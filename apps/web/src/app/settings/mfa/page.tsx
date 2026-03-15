"use client";

import { useState } from "react";
import { useAuth } from "../../../lib/auth-context";
import { api, ApiError } from "../../../lib/api-client";

// MFA SETTINGS PAGE
// Allows users to enroll in or disable TOTP-based two-factor authentication.

type Phase = "idle" | "setup" | "confirm" | "disable";

export default function MfaSettingsPage() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [secret, setSecret] = useState("");
  const [otpAuthUri, setOtpAuthUri] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const mfaEnabled = (user as any)?.mfaEnabled ?? false;

  const handleSetup = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.post<{ secret: string; otpAuthUri: string }>(
        "/api/v1/auth/mfa/setup",
        {},
      );
      setSecret(res.data.secret);
      setOtpAuthUri(res.data.otpAuthUri);
      setPhase("setup");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to begin MFA setup.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/v1/auth/mfa/verify", { code });
      setSuccess("Two-factor authentication is now enabled.");
      setPhase("idle");
      setCode("");
      // Refresh page so user object reflects mfaEnabled: true
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "INVALID_CREDENTIALS"
          ? "Incorrect code. Please try again."
          : "Verification failed.",
      );
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/v1/auth/mfa/disable", { code });
      setSuccess("Two-factor authentication has been disabled.");
      setPhase("idle");
      setCode("");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "INVALID_CREDENTIALS"
          ? "Incorrect code. Please try again."
          : "Failed to disable MFA.",
      );
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  // Encode otpauth URI as a QR code via Google Charts API (offline-safe alternative shown below)
  const qrUrl = otpAuthUri
    ? `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(otpAuthUri)}`
    : "";

  return (
    <div className="max-w-lg mx-auto py-10 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Two-Factor Authentication</h1>
        <p className="text-sm text-gray-500 mt-1">
          Protect your account with an authenticator app (Google Authenticator, Aegis, etc.).
        </p>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        {/* Status */}
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              mfaEnabled
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {mfaEnabled ? "Enabled" : "Not enabled"}
          </span>
          <span className="text-sm text-gray-600">
            {mfaEnabled
              ? "Your account requires an authenticator code at login."
              : "Add an extra layer of security to your account."}
          </span>
        </div>

        {/* Idle */}
        {phase === "idle" && (
          <div className="pt-2">
            {mfaEnabled ? (
              <button
                onClick={() => { setPhase("disable"); setError(""); setSuccess(""); }}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Disable 2FA
              </button>
            ) : (
              <button
                onClick={handleSetup}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Preparing..." : "Set up 2FA"}
              </button>
            )}
          </div>
        )}

        {/* Setup — show QR code and secret */}
        {phase === "setup" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.
            </p>
            {qrUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrUrl}
                alt="QR code for authenticator app"
                className="w-48 h-48 border border-gray-200 rounded-lg"
              />
            )}
            <div>
              <p className="text-xs text-gray-500 mb-1">Or enter the secret manually:</p>
              <code className="block bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm font-mono tracking-widest break-all select-all">
                {secret}
              </code>
            </div>
            <button
              onClick={() => setPhase("confirm")}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              I&apos;ve scanned the code →
            </button>
          </div>
        )}

        {/* Confirm setup */}
        {phase === "confirm" && (
          <form onSubmit={handleConfirm} className="space-y-4">
            <p className="text-sm text-gray-700">
              Enter the 6-digit code from your authenticator app to activate 2FA.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
              autoComplete="one-time-code"
              className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="000000"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Verifying..." : "Activate 2FA"}
              </button>
              <button
                type="button"
                onClick={() => { setPhase("idle"); setCode(""); setError(""); }}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Disable */}
        {phase === "disable" && (
          <form onSubmit={handleDisable} className="space-y-4">
            <p className="text-sm text-gray-700">
              Enter your current authenticator code to disable 2FA.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
              autoComplete="one-time-code"
              className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="000000"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Disabling..." : "Disable 2FA"}
              </button>
              <button
                type="button"
                onClick={() => { setPhase("idle"); setCode(""); setError(""); }}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
