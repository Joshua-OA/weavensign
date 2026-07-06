import type { Color, Fill, Stroke } from "@weavensign/schema";
import type { RawFill, RawStroke } from "./raw-paint.js";

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6})$/;

/** Parses a Penpot `#rrggbb` hex string into canonical 0-1 float color. Returns undefined for anything that isn't a plain 6-digit hex (Penpot fills can omit fillColor entirely for gradient/image fills this adapter doesn't support yet). */
export function parseHexColor(hex: string | undefined, opacity: number | undefined): Color | undefined {
  if (!hex) return undefined;
  const match = HEX_COLOR_PATTERN.exec(hex);
  if (!match || !match[1]) return undefined;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return { r, g, b, a: opacity ?? 1 };
}

export function mapFills(fills: RawFill[] | undefined): Fill[] {
  const mapped: Fill[] = [];
  for (const fill of fills ?? []) {
    const color = parseHexColor(fill.fillColor, fill.fillOpacity);
    if (color) {
      mapped.push({ type: "solid", color });
    }
  }
  return mapped;
}

const STROKE_ALIGN_MAP = { center: "center", inner: "inside", outer: "outside" } as const;

export function mapStrokes(strokes: RawStroke[] | undefined): Stroke[] {
  const mapped: Stroke[] = [];
  for (const stroke of strokes ?? []) {
    const color = parseHexColor(stroke.strokeColor, stroke.strokeOpacity);
    if (!color) continue;
    mapped.push({
      fill: { type: "solid", color },
      weight: stroke.strokeWidth ?? 1,
      align: stroke.strokeAlignment ? STROKE_ALIGN_MAP[stroke.strokeAlignment] : "center",
    });
  }
  return mapped;
}
