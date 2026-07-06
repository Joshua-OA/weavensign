/**
 * Penpot's `rect` and `circle` shape types don't carry SVG path data the way `path`
 * shapes (or Figma's ELLIPSE/RECTANGLE, via fillGeometry) do — only x/y/width/height and,
 * for rects, corner radii. Canonical VectorNode requires at least one path, so these two
 * shape types need their outline synthesized geometrically at adapter time rather than
 * left empty.
 */

const BEZIER_CIRCLE_CONSTANT = 0.5522847498;

/** Approximates an axis-aligned ellipse inscribed in (width, height) as four cubic bezier curves — the standard construction, same curve count Figma's own fillGeometry produces for ELLIPSE nodes. */
export function synthesizeEllipsePath(width: number, height: number): string {
  const rx = width / 2;
  const ry = height / 2;
  const kx = rx * BEZIER_CIRCLE_CONSTANT;
  const ky = ry * BEZIER_CIRCLE_CONSTANT;
  return [
    `M${width} ${ry}`,
    `C${width} ${ry + ky} ${rx + kx} ${height} ${rx} ${height}`,
    `C${rx - kx} ${height} 0 ${ry + ky} 0 ${ry}`,
    `C0 ${ry - ky} ${rx - kx} 0 ${rx} 0`,
    `C${rx + kx} 0 ${width} ${ry - ky} ${width} ${ry}`,
    "Z",
  ].join("");
}

/** Rect outline as a path, honoring a single uniform corner radius (`rx`/`ry` in Penpot's own data). Per-corner radii (r1-r4) aren't handled yet — a known gap, see README. */
export function synthesizeRectPath(width: number, height: number, cornerRadius: number): string {
  const r = Math.min(cornerRadius, width / 2, height / 2);
  if (r <= 0) {
    return `M0 0L${width} 0L${width} ${height}L0 ${height}Z`;
  }
  return [
    `M${r} 0`,
    `L${width - r} 0`,
    `A${r} ${r} 0 0 1 ${width} ${r}`,
    `L${width} ${height - r}`,
    `A${r} ${r} 0 0 1 ${width - r} ${height}`,
    `L${r} ${height}`,
    `A${r} ${r} 0 0 1 0 ${height - r}`,
    `L0 ${r}`,
    `A${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join("");
}
