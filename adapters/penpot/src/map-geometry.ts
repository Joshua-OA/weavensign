import type { Geometry } from "@weavensign/schema";
import type { RawSelrect, RawTransform } from "./raw-geometry.js";
import type { RawShape } from "./raw-shape.js";

const RADIANS_PER_DEGREE = Math.PI / 180;

function absoluteBox(shape: RawShape): RawSelrect {
  if (shape.x !== null && shape.y !== null && shape.width !== null && shape.height !== null) {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }
  // path shapes carry null x/y/width/height and rely on `selrect` instead — both are
  // page-absolute, so callers don't need to distinguish which source supplied the box.
  if (shape.selrect) {
    return shape.selrect;
  }
  return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Derives canonical (parent-relative) Geometry from a Penpot shape's absolute page-space
 * box and its resolved parent's absolute box. Penpot has no parent-relative field like
 * Figma's relativeTransform, so position is computed here rather than read directly.
 */
export function mapGeometry(shape: RawShape, parentBox: RawSelrect | undefined): Geometry {
  const box = absoluteBox(shape);
  const parentX = parentBox?.x ?? 0;
  const parentY = parentBox?.y ?? 0;

  const geometry: Geometry = {
    position: { x: box.x - parentX, y: box.y - parentY },
    size: { width: box.width, height: box.height },
    rotationDegrees: shape.rotation,
  };

  if (!shape.transform) {
    return geometry;
  }
  const { a, b, c, d } = shape.transform;
  return {
    ...geometry,
    rotationDegrees: Math.atan2(b, a) / RADIANS_PER_DEGREE,
    transform: { a, b, c, d, e: geometry.position.x, f: geometry.position.y },
  };
}

export function absoluteBoxOf(shape: RawShape): RawSelrect {
  return absoluteBox(shape);
}
