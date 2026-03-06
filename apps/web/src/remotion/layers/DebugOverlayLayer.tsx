import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";

type DebugOverlayMetric = {
  label: string;
  value: string | number | boolean;
};

type DebugOverlayLayerProps = {
  title?: string;
  metrics: DebugOverlayMetric[];
};

const formatValue = (value: string | number | boolean) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NaN";
    return value.toFixed(3);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value;
};

export const DebugOverlayLayer: React.FC<DebugOverlayLayerProps> = ({
  title = "Render Debug",
  metrics,
}) => {
  const { width, height } = useVideoConfig();
  const minSide = Math.min(width, height);
  const panelWidth = Math.min(width * 0.82, 980);
  const panelRadius = Math.max(10, Math.round(minSide * 0.018));
  const panelPaddingY = Math.max(12, Math.round(minSide * 0.028));
  const panelPaddingX = Math.max(14, Math.round(minSide * 0.032));
  const titleSize = Math.max(18, Math.min(36, Math.round(minSide * 0.045)));
  const textSize = Math.max(14, Math.min(30, Math.round(minSide * 0.033)));
  const labelWidth = Math.max(160, Math.min(panelWidth * 0.45, 360));

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 99 }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: panelWidth,
          borderRadius: panelRadius,
          border: "1px solid rgba(255,255,255,0.22)",
          background: "rgba(6,8,12,0.82)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
          color: "rgba(255,255,255,0.95)",
          fontSize: textSize,
          lineHeight: 1.4,
          padding: `${panelPaddingY}px ${panelPaddingX}px`,
          whiteSpace: "pre-wrap",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 14, fontSize: titleSize }}>{title}</div>
        {metrics.map((metric) => (
          <div key={metric.label} style={{ display: "flex", gap: 12 }}>
            <span style={{ opacity: 0.82, minWidth: labelWidth }}>{metric.label}</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {formatValue(metric.value)}
            </span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
