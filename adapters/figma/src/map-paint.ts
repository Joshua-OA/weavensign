import type { Fill, Stroke } from "@weavensign/schema";
import type { RawColor, RawPaint } from "./raw-paint.js";

const GRADIENT_TYPE_MAP = {
  GRADIENT_LINEAR: "linear",
  GRADIENT_RADIAL: "radial",
  GRADIENT_ANGULAR: "angular",
  GRADIENT_DIAMOND: "diamond",
} as const;

function mapColor(color: RawColor): { r: number; g: number; b: number; a: number } {
  return { r: color.r, g: color.g, b: color.b, a: color.a };
}

/** Maps one Figma Paint into a canonical Fill. Paint kinds we don't support yet (EMOJI, VIDEO) are rejected earlier, at RawPaintSchema parse time, so every value reaching here is one of the three mapped below. */
export function mapPaint(paint: RawPaint): Fill {
  if (paint.type === "SOLID") {
    return { type: "solid", color: mapColor(paint.color) };
  }
  if (paint.type === "IMAGE") {
    return {
      type: "image",
      assetRef: paint.imageRef,
      scaleMode: paint.scaleMode.toLowerCase() as "fill" | "fit" | "crop" | "tile",
    };
  }
  const [start, end, widthAxis] = paint.gradientHandlePositions;
  return {
    type: "gradient",
    gradientKind: GRADIENT_TYPE_MAP[paint.type],
    stops: paint.gradientStops.map((stop) => ({
      position: stop.position,
      color: mapColor(stop.color),
    })),
    handles: { start, end, widthAxis },
  };
}

export function mapFills(fills: RawPaint[] | undefined): Fill[] {
  return (fills ?? []).map(mapPaint);
}

export function mapStrokes(
  strokes: RawPaint[] | undefined,
  strokeWeight: number | undefined,
  strokeAlign: "INSIDE" | "OUTSIDE" | "CENTER" | undefined,
): Stroke[] {
  if (!strokes || strokes.length === 0) {
    return [];
  }
  const align = strokeAlign ? (strokeAlign.toLowerCase() as "inside" | "outside" | "center") : "center";
  return strokes.map((paint) => ({
    fill: mapPaint(paint),
    weight: strokeWeight ?? 1,
    align,
  }));
}
