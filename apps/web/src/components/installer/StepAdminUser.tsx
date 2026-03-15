"use client";

import { useState } from "react";
import type { InstallerFormData } from "../../app/install/page";

interface Props {
  data: Partial<InstallerFormData>;
  onNext: (data: Partial<InstallerFormData>) => void;
  onBack: () => void;
}

export function StepAdminUser({ data, onNext, onBack }: Props) {
  const [firstName, setFirstName] = useState(data.adminUser?.firstName ?? "");
  const [lastName, setLastName] = useState(data.adminUser?.lastName ?? "");
  const [email, setEmail] = useState(data.adminUser?.email ?? "");
  const [username, setUsername] = useState(data.adminUser?.username ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const passwordStrength = (
    p: string,
  ): { score: number; label: string; color: string } => {
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[a-z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    const labels = ["", "Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
    const colors = [
      "",
      "bg-red-500",
      "bg-orange-500",
      "bg-yellow-500",
      "bg-green-400",
      "bg-green-600",
    ];
    return { score, label: labels[score] ?? "", color: colors[score] ?? "" };
  };

  const strength = passwordStrength(password);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e["firstName"] = "First name is required";
    if (!lastName.trim()) e["lastName"] = "Last name is required";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e["email"] = "Valid email is required";
    if (!username.trim() || !/^[a-zA-Z0-9_.-]+$/.test(username))
      e["username"] =
        "Username can only contain letters, numbers, underscore, dot, hyphen";
    if (strength.score < 4)
      e["password"] =
        "Password is too weak (need uppercase, lowercase, number, special char)";
    if (password !== confirmPassword)
      e["confirmPassword"] = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    onNext({
      adminUser: {
        firstName,
        lastName,
        email,
        username,
        password,
        confirmPassword,
      },
    });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        Administrator Account
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        This creates the SUPER_ADMIN account. You will be prompted to change the
        password on first login.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name" error={errors["firstName"]}>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={cls(!!errors["firstName"])}
            />
          </Field>
          <Field label="Last Name" error={errors["lastName"]}>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={cls(!!errors["lastName"])}
            />
          </Field>
        </div>

        <Field label="Email Address" error={errors["email"]}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cls(!!errors["email"])}
          />
        </Field>

        <Field label="Username" error={errors["username"]}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={cls(!!errors["username"])}
          />
        </Field>

        <Field label="Password" error={errors["password"]}>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cls(!!errors["password"])}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {password && (
            <div className="mt-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded ${
                      i <= strength.score ? strength.color : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{strength.label}</p>
            </div>
          )}
        </Field>

        <Field label="Confirm Password" error={errors["confirmPassword"]}>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={cls(!!errors["confirmPassword"])}
          />
        </Field>
      </div>

      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs text-amber-700">
          <strong>Security note:</strong> Store your administrator credentials
          securely. You will be required to change the password on first login.
        </p>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | undefined;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function cls(hasError: boolean) {
  return `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    hasError ? "border-red-300" : "border-gray-300"
  }`;
}
