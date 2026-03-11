import React from "react";
import { hexToRgba } from "../utils";

type VisualizationBarsLayerProps = {
  bars: number[];
  paletteColors: string[];
  barPaletteColors: string[];
  accentColor: string;
  opacity?: number;
};

export const VisualizationBarsLayer: React.FC<VisualizationBarsLayerProps> = ({
  bars,
  paletteColors,
  barPaletteColors,
  accentColor,
  opacity = 1,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "flex-end",
        padding: "0",
        opacity,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`,
          gap: 4,
          alignItems: "end",
          height: 80,
          width: "100%",
          padding: "0 6px 0",
          background: "transparent",
        }}
      >
        {bars.map((value, index) => {
          const clamped = value;
          const shade =
            barPaletteColors[index % barPaletteColors.length] ??
            paletteColors[0] ??
            "#FFFFFF";

          return (
            <div
              key={`bar-${index}`}
              style={{
                height: `${clamped * 80}%`,
                borderRadius: 5,
                background: `linear-gradient(180deg, ${hexToRgba(
                  shade,
                  0.95
                )} 0%, ${hexToRgba(shade, 0.35)} 100%)`,
                boxShadow: `inset 0 1px 0 ${hexToRgba(
                  accentColor,
                  0.6
                )}, 0 0 6px ${hexToRgba(accentColor, 0.3)}`,
                opacity: 0.95,
                transformOrigin: "center bottom",
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
