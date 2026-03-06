import React from "react";
import { AbsoluteFill } from "remotion";

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
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 99 }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(30vw, 980px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.22)",
          background: "rgba(6,8,12,0.72)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          backdropFilter: "blur(7px)",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
          color: "rgba(255,255,255,0.95)",
          fontSize: 26,
          lineHeight: 1.4,
          padding: "24px 28px",
          whiteSpace: "pre-wrap",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 14, fontSize: 30 }}>{title}</div>
        {metrics.map((metric) => (
          <div key={metric.label} style={{ display: "flex", gap: 12 }}>
            <span style={{ opacity: 0.82, minWidth: 320 }}>{metric.label}</span>
            <span style={{ fontWeight: 600 }}>{formatValue(metric.value)}</span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
