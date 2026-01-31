"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ImageWithSkeletonProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  skeletonClassName?: string;
};

const ImageWithSkeleton = React.forwardRef<HTMLImageElement, ImageWithSkeletonProps>(
  ({ className, wrapperClassName, skeletonClassName, onLoad, alt = "", ...props }, ref) => {
    const [loaded, setLoaded] = React.useState(false);
    const innerRef = React.useRef<HTMLImageElement | null>(null);

    React.useImperativeHandle(ref, () => innerRef.current as HTMLImageElement);

    React.useEffect(() => {
      if (innerRef.current?.complete) {
        setLoaded(true);
      }
    }, []);

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
          onLoad={(event) => {
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
