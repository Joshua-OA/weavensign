import { z } from "zod";

export const RawColorSchema = z.object({
  r: z.number(),
  g: z.number(),
  b: z.number(),
  a: z.number(),
});
export type RawColor = z.infer<typeof RawColorSchema>;

export const RawGradientStopSchema = z.object({
  position: z.number(),
  color: RawColorSchema,
});

export const RawGradientHandleSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const RawSolidPaintSchema = z.object({
  type: z.literal("SOLID"),
  color: RawColorSchema,
});

const RawGradientPaintSchema = z.object({
  type: z.enum(["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"]),
  gradientHandlePositions: z.tuple([
    RawGradientHandleSchema,
    RawGradientHandleSchema,
    RawGradientHandleSchema,
  ]),
  gradientStops: z.array(RawGradientStopSchema).min(2),
});

const RawImagePaintSchema = z.object({
  type: z.literal("IMAGE"),
  imageRef: z.string(),
  scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE", "STRETCH"]),
});

/**
 * Figma's Paint type also includes EMOJI and VIDEO variants we don't map yet; unknown
 * `type` values are rejected by parseRawNode rather than silently dropped, so a new paint
 * kind surfaces as a visible adapter error instead of a silently incomplete render.
 */
export const RawPaintSchema = z.discriminatedUnion("type", [
  RawSolidPaintSchema,
  RawGradientPaintSchema,
  RawImagePaintSchema,
]);
export type RawPaint = z.infer<typeof RawPaintSchema>;

export const RawFillGeometrySchema = z.object({
  path: z.string(),
  windingRule: z.enum(["NONZERO", "EVENODD"]),
});
export type RawFillGeometry = z.infer<typeof RawFillGeometrySchema>;
