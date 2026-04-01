"use client";

import { useEffect } from "react";

function canRegisterServiceWorker() {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost");

  return "serviceWorker" in navigator && (window.isSecureContext || isLoopback);
}

export function PwaRegister() {
  useEffect(() => {
    if (!canRegisterServiceWorker()) {
      return;
    }

    void navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  }, []);

  return null;
}
