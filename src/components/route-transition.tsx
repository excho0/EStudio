"use client";

import NextLink, { LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

type TransitionOptions = {
  replace?: boolean;
  scroll?: boolean;
};

type RouteTransitionContextValue = {
  isTransitioning: boolean;
  startTransition: (href: string, options?: TransitionOptions) => void;
};

const RouteTransitionContext = createContext<RouteTransitionContextValue | null>(null);

const resolveHref = (href: LinkProps["href"]) => {
  if (typeof href === "string") return href;
  const pathname = href.pathname ?? "";
  const search = href.search ?? "";
  const hash = href.hash ?? "";
  return `${pathname}${search}${hash}`;
};

export function RouteTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const safetyTimeoutRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      window.clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    const reset = window.setTimeout(() => {
      setIsTransitioning(false);
    }, 0);
    return () => window.clearTimeout(reset);
  }, [pathname]);

  useEffect(() => {
    const handlePopState = () => {
      if (activeRef.current) return;
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      setIsTransitioning(true);
      if (safetyTimeoutRef.current) {
        window.clearTimeout(safetyTimeoutRef.current);
      }
      safetyTimeoutRef.current = window.setTimeout(() => {
        setIsTransitioning(false);
        safetyTimeoutRef.current = null;
      }, 900);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const startTransition = (href: string, options?: TransitionOptions) => {
    if (!href || href === pathname) return;
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    if (safetyTimeoutRef.current) {
      window.clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    setIsTransitioning(true);
    activeRef.current = true;
    const resolvedOptions = options ?? {};
    timeoutRef.current = window.setTimeout(() => {
      if (resolvedOptions.replace) {
        router.replace(href, { scroll: resolvedOptions.scroll ?? true });
      } else {
        router.push(href, { scroll: resolvedOptions.scroll ?? true });
      }
      activeRef.current = false;
    }, 200);
    safetyTimeoutRef.current = window.setTimeout(() => {
      setIsTransitioning(false);
      safetyTimeoutRef.current = null;
      activeRef.current = false;
    }, 1200);
  };

  return (
    <RouteTransitionContext.Provider value={{ isTransitioning, startTransition }}>
      {children}
    </RouteTransitionContext.Provider>
  );
}

export function useRouteTransition() {
  return useContext(RouteTransitionContext);
}

type TransitionLinkProps = LinkProps & {
  className?: string;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

export function Link({
  href,
  replace,
  scroll,
  onClick,
  children,
  ...rest
}: TransitionLinkProps) {
  const ctx = useRouteTransition();
  const resolvedHref = resolveHref(href);

  if (!ctx) {
    return (
      <NextLink
        href={href}
        replace={replace}
        scroll={scroll}
        onClick={onClick}
        {...rest}
      >
        {children}
      </NextLink>
    );
  }

  const { startTransition } = ctx;

  return (
    <NextLink
      href={href}
      replace={replace}
      scroll={scroll}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey
        ) {
          onClick?.(event);
          return;
        }
        event.preventDefault();
        onClick?.(event);
        startTransition(resolvedHref, { replace, scroll });
      }}
      {...rest}
    >
      {children}
    </NextLink>
  );
}
