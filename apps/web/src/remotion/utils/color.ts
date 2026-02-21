export const DEFAULT_PALETTE = ["#7CC2FF", "#4F86FF", "#4E56FF"];

export const normalizeHex = (value: string) => {
  const trimmed = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[0-9A-F]{6}$/.test(trimmed)) {
    return `#${trimmed}`;
  }
  return null;
};

export const hexToRgba = (hex: string, alpha: number) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return `rgba(124,194,255,${alpha})`;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const mixHex = (first: string, second: string, amount: number) => {
  const a = normalizeHex(first);
  const b = normalizeHex(second);
  if (!a || !b) return first;
  const t = Math.max(0, Math.min(1, amount));
  const toLinear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const toSrgb = (value: number) => {
    const c = value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, c)) * 255);
  };
  const ar = toLinear(Number.parseInt(a.slice(1, 3), 16));
  const ag = toLinear(Number.parseInt(a.slice(3, 5), 16));
  const ab = toLinear(Number.parseInt(a.slice(5, 7), 16));
  const br = toLinear(Number.parseInt(b.slice(1, 3), 16));
  const bg = toLinear(Number.parseInt(b.slice(3, 5), 16));
  const bb = toLinear(Number.parseInt(b.slice(5, 7), 16));
  const r = toSrgb(ar + (br - ar) * t);
  const g = toSrgb(ag + (bg - ag) * t);
  const b2 = toSrgb(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b2.toString(16).padStart(2, "0")}`;
};
