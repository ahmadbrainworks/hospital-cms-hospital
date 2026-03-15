"use client";

import { type ReactNode } from "react";
import { useAuth } from "../../lib/auth-context";
import { hasPermission } from "../../lib/permissions";
import { Permission, UserRole } from "@hospital-cms/shared-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

// DASHBOARD LAYOUT
// Sidebar navigation with permission-aware link visibility.

interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  {
    href: "/patients",
    label: "Patients",
    icon: "👤",
    permission: Permission.PATIENT_READ,
  },
  {
    href: "/encounters",
    label: "Encounters",
    icon: "🏥",
    permission: Permission.ENCOUNTER_READ,
  },
  {
    href: "/billing",
    label: "Billing",
    icon: "💳",
    permission: Permission.BILLING_READ,
  },
  {
    href: "/lab",
    label: "Laboratory",
    icon: "🔬",
    permission: Permission.LAB_ORDER_READ,
  },
  {
    href: "/pharmacy",
    label: "Pharmacy",
    icon: "💊",
    permission: Permission.PHARMACY_INVENTORY_READ,
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: "🔄",
    permission: Permission.WORKFLOW_READ,
  },
  {
    href: "/plugins",
    label: "Plugins",
    icon: "🔌",
    permission: Permission.SYSTEM_PLUGINS_MANAGE,
  },
  {
    href: "/themes",
    label: "Themes",
    icon: "🎨",
    permission: Permission.SYSTEM_THEMES_MANAGE,
  },
  {
    href: "/audit",
    label: "Audit Logs",
    icon: "📋",
    permission: Permission.AUDIT_READ,
  },
  {
    href: "/system",
    label: "System",
    icon: "🖥️",
    permission: Permission.SYSTEM_SETTINGS_READ,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "⚙️",
    permission: Permission.SYSTEM_SETTINGS_READ,
  },
];

interface Props {
  children: ReactNode;
}

export function DashboardLayout({ children }: Props) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    return hasPermission(user, item.permission);
  });

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">🏥</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm">
              Hospital CMS
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {visibleNav.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                )}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-xs font-semibold">
              {user.profile.firstName[0]}
              {user.profile.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.profile.firstName} {user.profile.lastName}
              </p>
              <p className="text-xs text-gray-500 truncate">{user.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-1 w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
