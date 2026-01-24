import type { ReactNode } from "react";
import AdminPanelLayout from "@/components/admin-panel/admin-panel-layout";
import { DashboardSocketProvider } from "@/app/(studio)/_components/dashboard-socket";
import { RenderNotifications } from "@/app/(studio)/_components/render-notifications";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardSocketProvider>
      <RenderNotifications />
      <AdminPanelLayout>{children}</AdminPanelLayout>
    </DashboardSocketProvider>
  );
}
