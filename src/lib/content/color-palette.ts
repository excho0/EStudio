import { Vibrant } from "node-vibrant/node";
import { getLogger } from "@/lib/logging";

const logger = getLogger("content-color-palette");

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
  logger.debug({ path, maxColors }, "Extracting color palette.");
  const palette = await Vibrant.from(path).maxColorCount(maxColors).getPalette();
  const colors = swatchesToPalette(palette, maxColors);
  logger.debug({ count: colors.length, colors }, "Extracted color palette.");
  return colors;
};
