import type { Geometry } from "@weavensign/schema";
import type { RawBoundingBox, RawSize, RawTransform } from "./raw-geometry.js";

const RADIANS_PER_DEGREE = Math.PI / 180;

/** Recovers rotation (degrees) from a 2x3 affine matrix's [a,b] column, ignoring any skew/scale beyond what rotation alone produces. */
function rotationDegreesFromTransform(transform: RawTransform): number {
  const [[a], [b]] = transform;
  return Math.atan2(b, a) / RADIANS_PER_DEGREE;
}

/**
 * Maps Figma geometry to canonical Geometry. Position and rotation come from
 * `relativeTransform` (parent-local space) when present; `absoluteBoundingBox` is used
 * only as a size fallback for nodes Figma doesn't give a relativeTransform for (this
 * hasn't been observed in practice but the REST API doesn't document it as guaranteed).
 */
export function mapGeometry(
  boundingBox: RawBoundingBox,
  transform: RawTransform | undefined,
  size: RawSize | undefined,
): Geometry {
  const width = size?.x ?? boundingBox.width;
  const height = size?.y ?? boundingBox.height;

  if (!transform) {
    return {
      position: { x: boundingBox.x, y: boundingBox.y },
      size: { width, height },
      rotationDegrees: 0,
    };
  }

  const [[a, c, e], [b, d, f]] = transform;
  return {
    position: { x: e, y: f },
    size: { width, height },
    rotationDegrees: rotationDegreesFromTransform(transform),
    transform: { a, b, c, d, e, f },
  };
}
