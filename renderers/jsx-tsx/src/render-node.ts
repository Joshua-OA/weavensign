import * as t from "@babel/types";
import { geometryDeclarations, styleDeclarations, textDeclarations, type CssDeclaration } from "@weavensign/renderer-shared";
import { assertNever, type DesignNode } from "@weavensign/schema";
import { renderSvgVector } from "./render-svg-vector.js";
import { renderTextRuns } from "./render-text.js";
import { declarationsToStyleObject } from "./style-object.js";

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
 * a positioned-ancestor context for its children — same reasoning as
 * renderer-html-css's render-node.ts, no separate `position: relative` needed (see
 * learning_v0.md #030 for the bug that reasoning fixed).
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

function styleAttribute(declarations: CssDeclaration[]): t.JSXAttribute {
  return t.jsxAttribute(t.jsxIdentifier("style"), t.jsxExpressionContainer(declarationsToStyleObject(declarations)));
}

function keyAttribute(nodeId: string): t.JSXAttribute {
  return t.jsxAttribute(t.jsxIdentifier("key"), t.stringLiteral(nodeId));
}

/**
 * Renders one DesignNode (and, for containers, its full subtree) into a JSX AST element.
 * Every node gets one absolutely-positioned <div> (or the inline <svg>/<span>s for
 * vector/text leaves) — same composition strategy as renderer-html-css, expressed as
 * Babel AST nodes instead of template strings since this renderer's output is one
 * generated .tsx program.
 */
export function renderNode(node: DesignNode): t.JSXElement | null {
  if (node.visible === false) {
    return null;
  }

  switch (node.type) {
    case "text": {
      const attrs = [keyAttribute(node.id), styleAttribute(textDeclarations(node.geometry, node.content.align, node.content.autoResize))];
      return t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("div"), attrs, false), t.jsxClosingElement(t.jsxIdentifier("div")), renderTextRuns(node), false);
    }
    case "vector": {
      const attrs = [keyAttribute(node.id), styleAttribute(geometryDeclarations(node.geometry))];
      return t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("div"), attrs, false), t.jsxClosingElement(t.jsxIdentifier("div")), [renderSvgVector(node)], false);
    }
    case "frame":
    case "group":
    case "component":
    case "component-instance": {
      const attrs = [keyAttribute(node.id), t.jsxAttribute(t.jsxIdentifier("title"), t.stringLiteral(node.name)), styleAttribute(containerDeclarations(node))];
      const children = childrenOf(node)
        .map((child) => renderNode(child))
        .filter((child): child is t.JSXElement => child !== null);
      return t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier("div"), attrs, false), t.jsxClosingElement(t.jsxIdentifier("div")), children, false);
    }
    default:
      return assertNever(node);
  }
}
