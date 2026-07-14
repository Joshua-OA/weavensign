import * as t from "@babel/types";
import { formatColor, formatPx } from "@weavensign/renderer-shared";
import type { TextNode, TextStyle } from "@weavensign/schema";
import { declarationsToStyleObject } from "./style-object.js";

const TEXT_DECORATION_CSS: Record<TextStyle["textDecoration"], string> = {
  none: "none",
  underline: "underline",
  strikethrough: "line-through",
};

const TEXT_TRANSFORM_CSS: Record<TextStyle["textCase"], string> = {
  none: "none",
  upper: "uppercase",
  lower: "lowercase",
  title: "capitalize",
};

/** Builds the declaration list for one TextRun's TextStyle — mirrors renderer-html-css's render-text.ts inline-style construction, kept local since it's JSX-specific attribute wiring, not reusable declaration logic (that part already lives in renderer-shared). */
function runStyleDeclarations(style: TextStyle): { prop: string; value: string }[] {
  const declarations = [
    { prop: "font-family", value: style.fontFamily },
    { prop: "font-weight", value: String(style.fontWeight) },
    { prop: "font-style", value: style.fontStyle },
    { prop: "font-size", value: formatPx(style.fontSizePx) },
    { prop: "letter-spacing", value: formatPx(style.letterSpacingPx) },
    { prop: "text-decoration", value: TEXT_DECORATION_CSS[style.textDecoration] },
    { prop: "text-transform", value: TEXT_TRANSFORM_CSS[style.textCase] },
  ];
  if (style.lineHeightPx !== undefined) {
    declarations.push({ prop: "line-height", value: formatPx(style.lineHeightPx) });
  }
  if (style.color) {
    declarations.push({ prop: "color", value: formatColor(style.color) });
  }
  return declarations;
}

/**
 * Wraps run.characters as a JS string literal inside a JSXExpressionContainer, not a
 * raw JSXText node. JSX text content treats `<`, `{`, and `&` as syntactically special
 * (a bare `<` inside JSXText breaks parsing entirely — hit exactly this on the real
 * "Hello & <world>" text run while generating this package's own golden fixtures); a
 * string literal has no such restriction, since only JS string-escaping rules apply,
 * and Babel's generator handles that escaping correctly for any input.
 */
function renderRunSpan(run: TextNode["content"]["runs"][number]): t.JSXElement {
  const styleAttr = t.jsxAttribute(t.jsxIdentifier("style"), t.jsxExpressionContainer(declarationsToStyleObject(runStyleDeclarations(run.style))));
  return t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier("span"), [styleAttr], false),
    t.jsxClosingElement(t.jsxIdentifier("span")),
    [t.jsxExpressionContainer(t.stringLiteral(run.characters))],
    false,
  );
}

/**
 * Renders a TextNode's runs as a sequence of JSX <span>s, one per run — mirrors
 * renderer-html-css's render-text.ts (a TextRun is "contiguous characters sharing one
 * style", so a <span> per run is a direct, lossless mapping there too).
 */
export function renderTextRuns(node: TextNode): t.JSXElement[] {
  return node.content.runs.map((run) => renderRunSpan(run));
}
