"use client";

import { useLayoutEffect, useRef, useState } from "react";

type StickyBoxProps = {
  top?: number;
  className?: string;
  fullWidth?: boolean;
  children: React.ReactNode | ((isSticky: boolean) => React.ReactNode);
};

export default function StickyBox({
  top = 24,
  className,
  fullWidth = false,
  children,
}: StickyBoxProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState({
    isSticky: false,
    width: 0,
    left: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    let raf = 0;
    const update = () => {
      const wrapperRect = wrapper.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const docTop = window.scrollY + wrapperRect.top;
      const docBottom = docTop + wrapperRect.height;
      const minTop = docTop - top;
      const maxTop = docBottom - contentRect.height - top;
      const shouldStick =
        maxTop <= minTop
          ? window.scrollY >= minTop
          : window.scrollY >= minTop && window.scrollY <= maxTop;

      setState((prev) => {
        const next = {
          isSticky: shouldStick,
          width: contentRect.width,
          left: wrapperRect.left,
          height: contentRect.height,
        };
        if (
          prev.isSticky === next.isSticky &&
          prev.width === next.width &&
          prev.left === next.left &&
          prev.height === next.height
        ) {
          return prev;
        }
        return next;
      });
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [top]);

  const renderChildren =
    typeof children === "function"
      ? (children as (isSticky: boolean) => React.ReactNode)(state.isSticky)
      : children;

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{ minHeight: state.height, alignSelf: "flex-start" }}
    >
      <div
        ref={contentRef}
        style={
          state.isSticky
            ? {
                position: "fixed",
                top,
                left: fullWidth ? 0 : state.left,
                right: fullWidth ? 0 : undefined,
                width: fullWidth ? "100%" : state.width,
                zIndex: 20,
              }
            : undefined
        }
      >
        {renderChildren}
      </div>
    </div>
  );
}
