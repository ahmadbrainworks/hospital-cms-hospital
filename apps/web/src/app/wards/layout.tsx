import { ReactNode } from "react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";

export const metadata = {
  title: "Wards | Hospital CMS",
};

export default function WardsLayout({ children }: { children: ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
