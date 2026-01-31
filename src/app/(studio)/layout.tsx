import type { ReactNode } from "react";
import AdminPanelLayout from "@/components/admin-panel/admin-panel-layout";
import { RenderNotifications } from "@/app/(studio)/_components/render-notifications";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>    
      <RenderNotifications />
      <AdminPanelLayout>{children}</AdminPanelLayout>
    </>
  );
}
