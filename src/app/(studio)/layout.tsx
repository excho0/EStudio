import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BodyScrollController } from "@/components/studio/body-scroll-controller";
import StudioShellLayout from "@/components/studio-shell/studio-shell-layout";
import { RenderNotifications } from "@/components/studio/render-notifications";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return (
    <>
      <BodyScrollController />
      <RenderNotifications />
      <StudioShellLayout>{children}</StudioShellLayout>
    </>
  );
}
