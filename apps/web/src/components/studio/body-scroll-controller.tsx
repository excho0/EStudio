"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo } from "react";

/**
 * Studio routes that should disable document/body scrolling.
 * Add new entries here to opt specific pages into body scroll lock.
 */
const NO_BODY_SCROLL_PATHS = ["/library", "/renders", "/publishes"];

/**
 * Sets a route-aware data attribute on `<body>` so global CSS can control scroll.
 *
 * When current route matches `NO_BODY_SCROLL_PATHS`, this component sets:
 * `document.body.dataset.scrollLocked = "true"`
 *
 * The stylesheet rule lives in `src/app/globals.css`:
 * `body[data-scroll-locked="true"] { overflow: hidden; }`
 */
export function BodyScrollController() {
  const pathname = usePathname();

  // Support exact routes (e.g. `/library`) and nested paths (`/library/...`).
  const shouldLockBodyScroll = useMemo(
    () =>
      NO_BODY_SCROLL_PATHS.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
      ),
    [pathname]
  );

  useLayoutEffect(() => {
    const body = document.body;

    // Keep lock on body only to avoid layout side effects on root html element.
    if (shouldLockBodyScroll) {
      body.dataset.scrollLocked = "true";
      body.style.setProperty("overflow", "hidden", "important");

      // Normalize viewport position so sticky header never overlays first content.
      // Re-apply for a short window to beat delayed scroll restoration on fast nav.
      const lockUntil = performance.now() + 220;
      let rafId: number | null = null;
      const enforceTop = () => {
        if (window.scrollX !== 0 || window.scrollY !== 0) {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
        if (performance.now() < lockUntil) {
          rafId = window.requestAnimationFrame(enforceTop);
        }
      };
      enforceTop();

      return () => {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
        }
      };
    }

    delete body.dataset.scrollLocked;
    body.style.removeProperty("overflow");
  }, [shouldLockBodyScroll]);

  useEffect(() => {
    return () => {
      delete document.body.dataset.scrollLocked;
      document.body.style.removeProperty("overflow");
    };
  }, []);

  return null;
}
