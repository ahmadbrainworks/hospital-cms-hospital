"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/lib/auth-context";
import { P } from "@/lib/permissions";

interface NavItem {
  href: string;
  label: string;
  /** At least one of these permissions is required for the link to show. */
  permissions?: string[];
}

const NAV: NavItem[] = [
  { href: "/overview", label: "Overview" },
  {
    href: "/instances",
    label: "Instances",
    permissions: [P.INSTANCE_VIEW],
  },
  {
    href: "/licenses",
    label: "Licenses",
    permissions: [P.LICENSE_VIEW],
  },
  {
    href: "/commands",
    label: "Commands",
    permissions: [P.COMMAND_VIEW],
  },
  {
    href: "/telemetry",
    label: "Telemetry",
    permissions: [P.TELEMETRY_VIEW],
  },
  {
    href: "/packages",
    label: "Packages",
    permissions: [P.PACKAGE_VIEW],
  },
  {
    href: "/themes",
    label: "Theme Builder",
    permissions: [P.PACKAGE_VIEW],
  },
  {
    href: "/staff",
    label: "Staff",
    permissions: [P.STAFF_VIEW],
  },
  {
    href: "/audit-log",
    label: "Audit Log",
    permissions: [P.AUDIT_VIEW],
  },
  {
    href: "/settings",
    label: "Settings",
    permissions: [P.SETTINGS_VIEW],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, logout, hasAnyPermission } = useAuth();

  const visibleNav = NAV.filter(
    (n) => !n.permissions || hasAnyPermission(...n.permissions),
  );

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-indigo-950 text-white flex flex-col flex-shrink-0">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-indigo-800">
          <div className="font-bold text-sm tracking-wide">Hospital CMS</div>
          <div className="text-xs text-indigo-300 mt-0.5">Vendor Dashboard</div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((n) => {
            const active =
              path === n.href || (n.href !== "/overview" && path.startsWith(n.href + "/"));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "block px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-indigo-700 text-white"
                    : "text-indigo-200 hover:text-white hover:bg-indigo-800/60",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        {user && (
          <div className="px-4 py-3 border-t border-indigo-800 text-xs">
            <div className="text-indigo-200 truncate">{user.displayName}</div>
            <div className="text-indigo-400 truncate mb-2">{user.email}</div>
            <button
              onClick={() => logout()}
              className="text-indigo-300 hover:text-white transition-colors text-xs"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
