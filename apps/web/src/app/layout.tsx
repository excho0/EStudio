import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TopProgressBar } from "@/components/providers/top-progress-bar";
import { ToasterResponsive } from "@/components/providers/toaster-responsive";
import { QueryProvider } from "@/components/providers/query-provider";
import { AppSessionProvider } from "@/components/auth/session-provider";
import { SocketIOProvider } from "@/components/studio/socketIO-provider";
import { PwaRegister } from "@/components/providers/pwa-register";
import { APP_NAME } from "@/lib/shared/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "AI-powered video content creation and rendering platform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PwaRegister />
        <QueryProvider>
          <SocketIOProvider>
            <AppSessionProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <Suspense fallback={null}><TopProgressBar /></Suspense>
                {children}
                <ToasterResponsive />
              </ThemeProvider>
            </AppSessionProvider>
          </SocketIOProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
