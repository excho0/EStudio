"use client";

import * as React from "react";

import { cn } from "@/lib/shared/utils";

const loadedImageSrcCache = new Set<string>();

type ImageWithSkeletonProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  skeletonClassName?: string;
};

const ImageWithSkeleton = React.forwardRef<HTMLImageElement, ImageWithSkeletonProps>(
  ({ className, wrapperClassName, skeletonClassName, onLoad, alt = "", src, ...props }, ref) => {
    const [loaded, setLoaded] = React.useState(() =>
      typeof src === "string" && src.length > 0 ? loadedImageSrcCache.has(src) : false
    );
    const innerRef = React.useRef<HTMLImageElement | null>(null);

    React.useImperativeHandle(ref, () => innerRef.current as HTMLImageElement);

    React.useEffect(() => {
      if (typeof src === "string" && src.length > 0 && loadedImageSrcCache.has(src)) {
        setLoaded(true);
        return;
      }
      setLoaded(false);
      if (innerRef.current?.complete) {
        setLoaded(true);
      }
    }, [src]);

    return (
      <div
        className={cn("relative overflow-hidden", wrapperClassName)}
        aria-busy={!loaded}
      >
        {!loaded ? (
          <div
            className={cn(
              "absolute inset-0 animate-pulse rounded-[inherit] bg-slate-100 dark:bg-white/10",
              skeletonClassName
            )}
          />
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={innerRef}
          className={cn(loaded ? "opacity-100" : "opacity-0", "transition-opacity duration-300", className)}
          src={src}
          onLoad={(event) => {
            if (typeof src === "string" && src.length > 0) {
              loadedImageSrcCache.add(src);
            }
            setLoaded(true);
            onLoad?.(event);
          }}
          onError={() => {
            setLoaded(true);
          }}
          {...props}
          alt={alt}
        />
      </div>
    );
  }
);

ImageWithSkeleton.displayName = "ImageWithSkeleton";

export { ImageWithSkeleton };
