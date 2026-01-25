import { Vibrant } from "node-vibrant/node";

const swatchesToPalette = (
  swatches: Record<string, { getHex?: () => string; hex?: string } | null>,
  maxColors: number
) => {
  const order = ["Vibrant", "LightVibrant", "DarkVibrant", "Muted", "LightMuted", "DarkMuted"];
  const hexes = order
    .map((key) => {
      const swatch = swatches[key];
      if (!swatch) return null;
      if (typeof swatch.getHex === "function") {
        return swatch.getHex();
      }
      return swatch.hex ?? null;
    })
    .filter((value): value is string => Boolean(value));
  const unique = Array.from(new Set(hexes));
  return unique.slice(0, maxColors);
};

export const getPaletteFromPath = async (path: string, maxColors = 5) => {
  console.log(`[palette] extracting from ${path}`);
  const palette = await Vibrant.from(path).maxColorCount(maxColors).getPalette();
  const colors = swatchesToPalette(palette, maxColors);
  console.log(`[palette] extracted ${colors.length} colors`, colors);
  return colors;
};
