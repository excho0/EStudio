"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NProgress from "nprogress";
import "nprogress/nprogress.css";

const DELAY_MS = 80;

export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeRequests = useRef(0);
  const timer = useRef<number | null>(null);
  const safetyTimer = useRef<number | null>(null);
  const state = useRef<"idle" | "loading">("idle");
  const patched = useRef(false);

  const queryString = useMemo(
    () => searchParams?.toString() ?? "",
    [searchParams]
  );

  const start = () => {
    if (state.current === "loading") {
      return;
    }
    state.current = "loading";
    if (timer.current) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => {
      NProgress.start();
    }, DELAY_MS);
    if (safetyTimer.current) {
      window.clearTimeout(safetyTimer.current);
    }
    safetyTimer.current = window.setTimeout(() => {
      if (activeRequests.current === 0) {
        stop();
      }
    }, 1500);
  };

  const stop = () => {
    if (activeRequests.current > 0) {
      return;
    }
    state.current = "idle";
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (safetyTimer.current) {
      window.clearTimeout(safetyTimer.current);
      safetyTimer.current = null;
    }
    NProgress.done();
  };

  useEffect(() => {
    NProgress.configure({
      showSpinner: false,
      trickleSpeed: 160,
      minimum: 0.1,
      easing: "ease",
      speed: 280,
    });
  }, []);

  useEffect(() => {
    if (patched.current) {
      return;
    }
    patched.current = true;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      if (activeRequests.current === 0) {
        start();
      }
      activeRequests.current += 1;
      try {
        return await originalFetch(...args);
      } finally {
        activeRequests.current -= 1;
        if (activeRequests.current === 0) {
          stop();
        }
      }
    };

    const handleLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
        return;
      }

      try {
        const url = new URL(href, window.location.href);
        const normalize = (value: string) =>
          value.endsWith("/") && value !== "/" ? value.slice(0, -1) : value;
        if (url.origin !== window.location.origin) {
          return;
        }
        if (
          normalize(url.pathname) === normalize(window.location.pathname) &&
          url.search === window.location.search
        ) {
          return;
        }
        start();
      } catch {
        return;
      }
    };

    const handlePopState = () => {
      start();
    };
    document.addEventListener("click", handleLinkClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.fetch = originalFetch;
      document.removeEventListener("click", handleLinkClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    stop();
  }, [pathname, queryString]);

  return null;
}
