import { ReactNode } from "react";
import { DashboardLayout } from "../../components/layout/DashboardLayout";

export const metadata = {
  title: "Doctors | Hospital CMS",
};

export default function DoctorsLayout({ children }: { children: ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
