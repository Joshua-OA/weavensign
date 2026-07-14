import { assertNever, type DesignNode } from "@weavensign/schema";
import { geometryDeclarations, styleDeclarations, textDeclarations, type CssDeclaration } from "@weavensign/renderer-shared";
import { escapeHtml } from "./escape-html.js";
import { renderSvgVector } from "./render-svg-vector.js";
import { renderText } from "./render-text.js";
import { stringifyRule } from "./stringify-css.js";

/** Sanitizes a DesignNode id into a value safe to use as an HTML id / CSS selector (ids can contain characters like `:` that are valid in source data but not in a bare CSS identifier). */
function cssSelector(nodeId: string): string {
  return `#node-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function htmlId(nodeId: string): string {
  return `node-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function childrenOf(node: DesignNode): DesignNode[] {
  switch (node.type) {
    case "frame":
    case "group":
    case "component":
    case "component-instance":
      return node.children;
    case "text":
    case "vector":
      return [];
    default:
      return assertNever(node);
  }
}

/**
 * A container's own `position: absolute` (from geometryDeclarations) already establishes
 * a positioned-ancestor context for its children's `left`/`top` — no separate
 * `position: relative` declaration is needed, and adding one would silently override the
 * `absolute` value CSS's `position` property already carries (only one wins; the last
 * declaration written to the same property replaces the earlier one).
 */
function containerDeclarations(node: DesignNode): CssDeclaration[] {
  const declarations = [...geometryDeclarations(node.geometry)];
  if ("style" in node) {
    declarations.push(...styleDeclarations(node.style));
  }
  if ("clipsContent" in node ? node.clipsContent : false) {
    declarations.push({ prop: "overflow", value: "hidden" });
  }
  return declarations;
}

/**
 * Renders one DesignNode (and, for containers, its full subtree) into an HTML fragment
 * plus that fragment's CSS rules, appended to the shared `cssRules` accumulator. Every
 * node gets one absolutely-positioned element (or inline <svg>/<span>s for vector/text
 * leaves) — see css-declarations.ts for why `position: absolute` on each node's own rule
 * is the entire composition strategy for PositionSchema's parent-relative convention,
 * with no separate `position: relative` declaration needed anywhere.
 */
export function renderNode(node: DesignNode, cssRules: string[]): string {
  if (node.visible === false) {
    return "";
  }

  switch (node.type) {
    case "text": {
      cssRules.push(stringifyRule(cssSelector(node.id), textDeclarations(node.geometry, node.content.align, node.content.autoResize)));
      return `<div id="${htmlId(node.id)}">${renderText(node)}</div>`;
    }
    case "vector": {
      cssRules.push(stringifyRule(cssSelector(node.id), geometryDeclarations(node.geometry)));
      return `<div id="${htmlId(node.id)}">${renderSvgVector(node)}</div>`;
    }
    case "frame":
    case "group":
    case "component":
    case "component-instance": {
      cssRules.push(stringifyRule(cssSelector(node.id), containerDeclarations(node)));
      const childrenHtml = childrenOf(node)
        .map((child) => renderNode(child, cssRules))
        .join("");
      return `<div id="${htmlId(node.id)}" title="${escapeHtml(node.name)}">${childrenHtml}</div>`;
    }
    default:
      return assertNever(node);
  }
}
