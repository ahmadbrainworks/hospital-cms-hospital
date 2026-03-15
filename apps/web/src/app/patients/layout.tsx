"use client";

import { DashboardLayout } from "../../components/layout/DashboardLayout";

export default function PatientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
