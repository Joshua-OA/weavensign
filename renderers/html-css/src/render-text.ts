import type { TextNode, TextStyle } from "@weavensign/schema";
import { formatColor, formatPx } from "@weavensign/renderer-shared";
import { escapeHtml } from "./escape-html.js";

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

/** Builds the inline `style="..."` attribute value for one TextRun's TextStyle. */
function runStyleAttr(style: TextStyle): string {
  const declarations = [
    `font-family: ${style.fontFamily}`,
    `font-weight: ${style.fontWeight}`,
    `font-style: ${style.fontStyle}`,
    `font-size: ${formatPx(style.fontSizePx)}`,
    `letter-spacing: ${formatPx(style.letterSpacingPx)}`,
    `text-decoration: ${TEXT_DECORATION_CSS[style.textDecoration]}`,
    `text-transform: ${TEXT_TRANSFORM_CSS[style.textCase]}`,
  ];
  if (style.lineHeightPx !== undefined) {
    declarations.push(`line-height: ${formatPx(style.lineHeightPx)}`);
  }
  if (style.color) {
    declarations.push(`color: ${formatColor(style.color)}`);
  }
  return declarations.join("; ");
}

/**
 * Renders a TextNode's runs as a sequence of inline <span>s, one per run, each carrying
 * its own TextStyle as an inline style attribute — TextContent.runs is exactly "contiguous
 * characters sharing one TextStyle" (schema/src/typography.ts), so a <span> per run is a
 * direct, lossless mapping with no need to diff/merge adjacent styles.
 */
export function renderText(node: TextNode): string {
  return node.content.runs
    .map((run) => `<span style="${runStyleAttr(run.style)}">${escapeHtml(run.characters)}</span>`)
    .join("");
}
