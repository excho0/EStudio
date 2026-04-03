"use client";

import type { CSSProperties } from "react";
import { useId } from "react";
import { cn } from "./_adapter";

export interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  showFill?: boolean;
  fillOpacity?: number;
}

type Point = {
  x: number;
  y: number;
};

function buildSmoothPath(points: Point[]) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const point = points[0]!;
    return `M ${point.x} ${point.y}`;
  }

  let path = `M ${points[0]!.x} ${points[0]!.y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    const controlX = (current.x + next.x) / 2;
    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }

  return path;
}

export function Sparkline({
  data,
  color = "currentColor",
  width = 64,
  height = 24,
  className,
  style,
  showFill = false,
  fillOpacity = 0.09,
}: SparklineProps) {
  const gradientId = useId();

  if (data.length < 2) {
    return null;
  }

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  const xPadding = 0;
  const yPadding = 2;
  const usableWidth = Math.max(1, width - xPadding * 2);
  const usableHeight = Math.max(1, height - yPadding * 2);

  const linePoints = data.map((value, index) => {
    const x = xPadding + (index / (data.length - 1)) * usableWidth;
    const y =
      yPadding + usableHeight - ((value - minVal) / range) * usableHeight;
    return { x, y };
  });

  const linePath = buildSmoothPath(linePoints);

  const areaPath = `${linePath} L ${linePoints[linePoints.length - 1]!.x} ${height - yPadding} L ${linePoints[0]!.x} ${height - yPadding} Z`;

  const animationDelay = style?.animationDelay ?? "0ms";
  const baseAnimationDelay =
    typeof animationDelay === "number" ? `${animationDelay}ms` : animationDelay;
  const secondaryAnimationDelay = `calc(${baseAnimationDelay} + 100ms)`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={cn("h-full w-full shrink-0", className)}
      style={style}
      preserveAspectRatio="none"
    >
      {showFill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={areaPath}
            fill={`url(#${gradientId})`}
            className="animate-in fade-in duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] fill-mode-both"
            style={{ animationDelay }}
          />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.15}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={0.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        strokeDasharray="0.36 0.64"
        strokeDashoffset={0}
        strokeOpacity={0.2}
        className="opacity-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 motion-safe:ease-out motion-safe:fill-mode-both"
        style={{ animationDelay: baseAnimationDelay }}
      />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={0.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        strokeDasharray="0.24 0.76"
        strokeDashoffset={0}
        strokeOpacity={0.65}
        className="opacity-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 motion-safe:ease-out motion-safe:fill-mode-both"
        style={{ animationDelay: secondaryAnimationDelay }}
      />
    </svg>
  );
}
