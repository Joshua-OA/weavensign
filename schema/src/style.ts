import { z } from "zod";

/** sRGB color with straight (non-premultiplied) alpha, 0-1 per channel. */
export const ColorSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1).default(1),
});
export type Color = z.infer<typeof ColorSchema>;

export const SolidFillSchema = z.object({
  type: z.literal("solid"),
  color: ColorSchema,
});

export const GradientStopSchema = z.object({
  position: z.number().min(0).max(1),
  color: ColorSchema,
});

/**
 * Three control points (start, end, and a third defining the gradient's width axis) in
 * the node's local 0-1 bounding-box space. This mirrors how Figma/Penpot both actually
 * represent gradient placement — neither exposes a raw affine matrix for gradients — so
 * adapters map directly with no reconstruction.
 */
export const GradientHandlesSchema = z.object({
  start: z.object({ x: z.number(), y: z.number() }),
  end: z.object({ x: z.number(), y: z.number() }),
  widthAxis: z.object({ x: z.number(), y: z.number() }),
});

export const GradientFillSchema = z.object({
  type: z.literal("gradient"),
  gradientKind: z.enum(["linear", "radial", "angular", "diamond"]),
  stops: z.array(GradientStopSchema).min(2),
  handles: GradientHandlesSchema,
});

export const ImageFillSchema = z.object({
  type: z.literal("image"),
  assetRef: z.string(),
  scaleMode: z.enum(["fill", "fit", "crop", "tile", "stretch"]),
});

/** Discriminated union of fill kinds a node's `fills` array may contain. */
export const FillSchema = z.discriminatedUnion("type", [
  SolidFillSchema,
  GradientFillSchema,
  ImageFillSchema,
]);
export type Fill = z.infer<typeof FillSchema>;

export const StrokeSchema = z.object({
  fill: FillSchema,
  weight: z.number().nonnegative(),
  align: z.enum(["inside", "outside", "center"]).default("center"),
  dashPattern: z.array(z.number()).optional(),
});
export type Stroke = z.infer<typeof StrokeSchema>;

export const EffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("drop-shadow"),
    color: ColorSchema,
    offset: z.object({ x: z.number(), y: z.number() }),
    blur: z.number().nonnegative(),
    spread: z.number().default(0),
  }),
  z.object({
    type: z.literal("inner-shadow"),
    color: ColorSchema,
    offset: z.object({ x: z.number(), y: z.number() }),
    blur: z.number().nonnegative(),
    spread: z.number().default(0),
  }),
  z.object({
    type: z.literal("layer-blur"),
    radius: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal("background-blur"),
    radius: z.number().nonnegative(),
  }),
]);
export type Effect = z.infer<typeof EffectSchema>;

/** Visual styling shared by any node that can paint fills/strokes/effects: shapes, frames, text, vectors. */
export const StyleSchema = z.object({
  fills: z.array(FillSchema).default([]),
  strokes: z.array(StrokeSchema).default([]),
  effects: z.array(EffectSchema).default([]),
  opacity: z.number().min(0).max(1).default(1),
  cornerRadius: z.number().nonnegative().optional(),
  blendMode: z
    .enum([
      "normal",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "color-dodge",
      "color-burn",
    ])
    .default("normal"),
});
export type Style = z.infer<typeof StyleSchema>;
