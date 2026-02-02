import type { ReactNode } from "react";
import StudioShellLayout from "@/components/studio-shell/studio-shell-layout";
import { RenderNotifications } from "@/components/studio/render-notifications";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>    
      <RenderNotifications />
      <StudioShellLayout>{children}</StudioShellLayout>
    </>
  );
}
