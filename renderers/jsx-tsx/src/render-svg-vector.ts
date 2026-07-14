import * as t from "@babel/types";
import { formatColor, formatNumber } from "@weavensign/renderer-shared";
import type { VectorNode } from "@weavensign/schema";

function jsxAttr(name: string, value: string): t.JSXAttribute {
  return t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value));
}

function renderPathElement(path: VectorNode["paths"][number]): t.JSXElement {
  const attrs = [jsxAttr("d", path.data), jsxAttr("fillRule", path.windingRule)];
  return t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("path"), attrs, true), null, [], true);
}

/**
 * Renders a VectorNode's paths as a real JSX <svg> element (Babel AST, not a string) —
 * mirrors @weavensign/renderer-html-css's render-svg-vector.ts (same reasoning: HTML/JSX
 * has no native way to paint arbitrary path geometry), but built as AST nodes here since
 * this renderer's whole output is one Babel program, not a template string.
 */
export function renderSvgVector(node: VectorNode): t.JSXElement {
  const width = formatNumber(node.geometry.size.width);
  const height = formatNumber(node.geometry.size.height);
  const solidFill = node.style.fills.find((fill) => fill.type === "solid");
  const solidStroke = node.style.strokes.find((stroke) => stroke.fill.type === "solid");

  const attrs = [
    jsxAttr("width", width),
    jsxAttr("height", height),
    jsxAttr("viewBox", `0 0 ${width} ${height}`),
    jsxAttr("fill", solidFill ? formatColor(solidFill.color) : "none"),
  ];
  if (solidStroke && solidStroke.fill.type === "solid") {
    attrs.push(jsxAttr("stroke", formatColor(solidStroke.fill.color)));
    attrs.push(jsxAttr("strokeWidth", formatNumber(solidStroke.weight)));
  }

  const pathElements = node.paths.map((path) => renderPathElement(path));
  return t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("svg"), attrs, false), t.jsxClosingElement(t.jsxIdentifier("svg")), pathElements, false);
}
