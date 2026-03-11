import { useMemo } from "react";
import { DEFAULT_PALETTE, mixHex, normalizeHex } from "../utils";

export const useCompositionPalette = (colorPalette?: string[] | null) => {
  const paletteColors = useMemo(() => {
    if (!colorPalette?.length) return DEFAULT_PALETTE;
    const cleaned = colorPalette
      .map((value) => normalizeHex(value))
      .filter((value): value is string => Boolean(value));
    const base = cleaned.length ? cleaned : DEFAULT_PALETTE;
    return base.slice(0, 5);
  }, [colorPalette]);

  const accentColor = paletteColors.length > 0 ? paletteColors[0] : DEFAULT_PALETTE[0];

  const barPaletteColors = useMemo(() => {
    return paletteColors.slice(0, 2);
  }, [paletteColors]);

  const glowColor = useMemo(() => {
    const base =
      paletteColors[1] ?? paletteColors[0] ?? DEFAULT_PALETTE[1] ?? DEFAULT_PALETTE[0];
    return mixHex(base, "#FFFFFF", 0.34);
  }, [paletteColors]);

  const captionHighlightColor = useMemo(() => {
    const accent = paletteColors[2] ?? DEFAULT_PALETTE[2] ?? "#FFFFFF";
    return mixHex(accent, "#FFFFFF", 0.12);
  }, [paletteColors]);

  return {
    paletteColors,
    accentColor,
    barPaletteColors,
    glowColor,
    captionHighlightColor,
  };
};
