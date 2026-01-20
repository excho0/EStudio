import type { ReactNode } from "react";
import AdminPanelLayout from "@/components/admin-panel/admin-panel-layout";
import { DashboardSocketProvider } from "@/app/(studio)/_components/dashboard-socket";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardSocketProvider>
      <AdminPanelLayout>{children}</AdminPanelLayout>
    </DashboardSocketProvider>
  );
}
