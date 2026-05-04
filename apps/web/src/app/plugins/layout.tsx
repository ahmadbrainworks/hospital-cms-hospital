"use client";

import { DashboardLayout } from "../../components/layout/DashboardLayout";
import { useRequireAuth } from "../../lib/auth-context";

export default function PluginsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isAuthenticated } = useRequireAuth();

  if (isLoading || !isAuthenticated) return null;

  return <DashboardLayout>{children}</DashboardLayout>;
}
