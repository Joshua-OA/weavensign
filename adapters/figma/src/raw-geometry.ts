import { z } from "zod";

/** Figma's `relativeTransform`: 2x3 affine matrix as [[a,c,e],[b,d,f]] rows, translation in the parent's local space. */
export const RawTransformSchema = z.tuple([
  z.tuple([z.number(), z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number()]),
]);
export type RawTransform = z.infer<typeof RawTransformSchema>;

/** Figma's `size`: despite the x/y field names, this is a width/height pair, not a point. */
export const RawSizeSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type RawSize = z.infer<typeof RawSizeSchema>;

export const RawBoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type RawBoundingBox = z.infer<typeof RawBoundingBoxSchema>;
