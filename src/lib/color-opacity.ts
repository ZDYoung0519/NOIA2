function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

type RgbColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

function parseColor(value: string): RgbColor | null {
  const trimmed = value.trim();

  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    const normalized =
      hex.length === 3
        ? hex
            .split("")
            .map((char) => `${char}${char}`)
            .join("")
        : hex.padEnd(6, "0").slice(0, 6);
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);

    if ([r, g, b].some((channel) => Number.isNaN(channel))) {
      return null;
    }

    return { r, g, b, a: 1 };
  }

  const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (!rgbMatch) {
    return null;
  }

  const parts = rgbMatch[1].split(",").map((part) => part.trim());
  const [r, g, b] = parts.slice(0, 3).map((part) => Number(part));
  const a = parts[3] != null ? Number(parts[3]) : 1;

  if (![r, g, b, a].every((channel) => Number.isFinite(channel))) {
    return null;
  }

  return {
    r: clampChannel(r),
    g: clampChannel(g),
    b: clampChannel(b),
    a: Math.max(0, Math.min(1, a)),
  };
}

export function colorToRgba(value: string, alphaPercent: number) {
  const color = parseColor(value);
  const alpha = Math.max(0, Math.min(100, alphaPercent)) / 100;

  if (!color) {
    return value;
  }

  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

export function colorToHex(value: string, fallback: string) {
  const color = parseColor(value);
  if (!color) {
    return fallback;
  }

  return `#${color.r.toString(16).padStart(2, "0")}${color.g
    .toString(16)
    .padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`;
}

export function colorToOpacityPercent(value: string, fallback: number) {
  const color = parseColor(value);
  if (!color) {
    return fallback;
  }

  return Math.round(color.a * 100);
}
