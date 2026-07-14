import { formatNumber } from "@weavensign/renderer-shared";
import type { VectorNode } from "@weavensign/schema";
import { attributesToXml, styleAttributes } from "./svg-attributes.js";

/**
 * Renders a VectorNode's paths as <path> elements, positioned via a translate transform
 * (SVG's native coordinate model — no absolute-positioning concept exists in SVG the way
 * CSS has `position: absolute`; nesting inside a translated parent is how SVG expresses
 * "this shape lives at (x, y) in its parent's local space", matching PositionSchema's
 * parent-relative convention directly).
 */
export function renderVector(node: VectorNode): string {
  const attrs = attributesToXml(styleAttributes(node.style));
  const transform = `translate(${formatNumber(node.geometry.position.x)}, ${formatNumber(node.geometry.position.y)})`;
  const paths = node.paths.map((path) => `<path d="${path.data}" fill-rule="${path.windingRule}"/>`).join("");
  return `<g transform="${transform}" ${attrs}>${paths}</g>`;
}
