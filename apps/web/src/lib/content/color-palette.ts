import sharp from "sharp";
import { getLogger } from "@/lib/logging";

const logger = getLogger("content-color-palette");

export const getPaletteFromPath = async (path: string, maxColors = 5) => {
  logger.debug({ path, maxColors }, "Extracting color palette.");
  const { data, info } = await sharp(path)
    .resize({ width: 128, height: 128, fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colorsByHex = new Map<string, number>();
  for (let index = 0; index + 2 < data.length; index += info.channels) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const hex = `#${[red, green, blue]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`;
    colorsByHex.set(hex, (colorsByHex.get(hex) ?? 0) + 1);
  }
  const colors = [...colorsByHex.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, maxColors)
    .map(([hex]) => hex);
  logger.debug({ count: colors.length, colors }, "Extracted color palette.");
  return colors;
};
