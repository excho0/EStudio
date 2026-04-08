import type { ReactNode } from "react";
import { BodyScrollController } from "@/components/studio/body-scroll-controller";
import StudioShellLayout from "@/components/studio-shell/studio-shell-layout";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <BodyScrollController />
      <StudioShellLayout>{children}</StudioShellLayout>
    </>
  );
}
