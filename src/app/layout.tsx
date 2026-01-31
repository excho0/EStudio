import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TopProgressBar } from "@/components/top-progress-bar";
import { ToasterResponsive } from "@/components/toaster-responsive";
import { QueryProvider } from "@/components/query-provider";
import { AppSessionProvider } from "@/components/session-provider";
import { SocketIOProvider } from "./(studio)/_components/socketIO-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EStudio",
  description: "AI-powered video content creation and rendering platform",
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
        <SocketIOProvider>
          <QueryProvider>
            <AppSessionProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <TopProgressBar />
                {children}
                <ToasterResponsive />
              </ThemeProvider>
            </AppSessionProvider>
          </QueryProvider>
        </SocketIOProvider>
      </body>
    </html>
  );
}
