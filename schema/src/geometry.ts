import { z } from "zod";

/**
 * x/y offset relative to the parent node's origin, in the parent's local coordinate
 * space — never page/absolute coordinates. Figma exposes this as `relativeTransform`'s
 * translation component (not `absoluteBoundingBox`, which is page-space and must not be
 * used here); adapters must derive position from the parent-relative source, or the tree
 * stops composing correctly once reparented or moved.
 */
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Position = z.infer<typeof PositionSchema>;

/** Bounding box size in the node's own coordinate space. */
export const SizeSchema = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Size = z.infer<typeof SizeSchema>;

/** 2D affine transform matrix, column-major, matching Figma/Penpot's `[a, b, c, d, e, f]` convention. */
export const TransformSchema = z.object({
  a: z.number(),
  b: z.number(),
  c: z.number(),
  d: z.number(),
  e: z.number(),
  f: z.number(),
});
export type Transform = z.infer<typeof TransformSchema>;

/** Full placement of a node: position, size, rotation, and optional additional transform. */
export const GeometrySchema = z.object({
  position: PositionSchema,
  size: SizeSchema,
  rotationDegrees: z.number().default(0),
  transform: TransformSchema.optional(),
});
export type Geometry = z.infer<typeof GeometrySchema>;
