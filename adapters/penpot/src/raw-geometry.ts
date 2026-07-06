import { z } from "zod";

/** Penpot's 2x3 affine matrix — identical [a,b,c,d,e,f] convention to Figma's relativeTransform, but here it carries only rotation/skew: translation is handled separately by the shape's own x/y. */
export const RawTransformSchema = z.object({
  a: z.number(),
  b: z.number(),
  c: z.number(),
  d: z.number(),
  e: z.number(),
  f: z.number(),
});
export type RawTransform = z.infer<typeof RawTransformSchema>;

/** Absolute page-space bounding box. Penpot has no parent-relative field like Figma's relativeTransform — the adapter derives local position by subtracting the resolved parent's absolute x/y. */
export const RawSelrectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type RawSelrect = z.infer<typeof RawSelrectSchema>;
