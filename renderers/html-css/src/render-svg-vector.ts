import type { VectorNode } from "@weavensign/schema";
import { formatColor, formatNumber } from "./format-value.js";

/**
 * Renders a VectorNode's paths as an inline <svg>, sized to the node's own bounding box.
 * HTML/CSS has no native way to paint arbitrary vector path data (unlike a rect/ellipse
 * primitive), so every vector node becomes its own self-contained <svg> element rather
 * than a CSS shape — the standard approach for design-to-HTML output, and the only one
 * that preserves exact path geometry (not just approximable primitives).
 */
export function renderSvgVector(node: VectorNode): string {
  const width = formatNumber(node.geometry.size.width);
  const height = formatNumber(node.geometry.size.height);
  const solidFill = node.style.fills.find((fill) => fill.type === "solid");
  const solidStroke = node.style.strokes.find((stroke) => stroke.fill.type === "solid");

  const fillAttr = solidFill ? formatColor(solidFill.color) : "none";
  const strokeAttrs =
    solidStroke && solidStroke.fill.type === "solid"
      ? ` stroke="${formatColor(solidStroke.fill.color)}" stroke-width="${formatNumber(solidStroke.weight)}"`
      : "";

  const paths = node.paths
    .map((path) => `<path d="${path.data}" fill-rule="${path.windingRule}"/>`)
    .join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="${fillAttr}"${strokeAttrs}>${paths}</svg>`;
}
