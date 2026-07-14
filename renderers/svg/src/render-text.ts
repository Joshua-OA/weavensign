import { formatColor, formatNumber } from "@weavensign/renderer-shared";
import type { TextNode, TextStyle } from "@weavensign/schema";
import { escapeXml } from "./escape-xml.js";

/**
 * Approximate ratio of a font's ascent (cap-height-to-baseline distance) to its
 * fontSizePx, used to convert the schema's box-top-anchored geometry into SVG's
 * baseline-anchored `<text y>` coordinate. The schema carries no real font-metrics data
 * (no ascent/descent/baseline field — schema/src/typography.ts), and no two fonts share
 * exactly the same ratio, so this is a documented approximation, not a precise value;
 * good enough for a text node to visually sit inside its own bounding box, not a
 * pixel-exact metric.
 */
const BASELINE_RATIO = 0.8;

const TEXT_DECORATION_SVG: Record<TextStyle["textDecoration"], string | undefined> = {
  none: undefined,
  underline: "underline",
  strikethrough: "line-through",
};

function runAttributes(style: TextStyle): string {
  const attrs = [
    `font-family="${escapeXml(style.fontFamily)}"`,
    `font-weight="${style.fontWeight}"`,
    `font-size="${formatNumber(style.fontSizePx)}"`,
  ];
  if (style.fontStyle === "italic") {
    attrs.push(`font-style="italic"`);
  }
  const decoration = TEXT_DECORATION_SVG[style.textDecoration];
  if (decoration) {
    attrs.push(`text-decoration="${decoration}"`);
  }
  if (style.color) {
    attrs.push(`fill="${formatColor(style.color)}"`);
  }
  return attrs.join(" ");
}

/** Applies TextStyle.textCase to a run's rendered characters. SVG has no CSS-equivalent text-transform attribute, so case transforms are applied to the text content directly, not left to the renderer's consumer. */
function applyTextCase(characters: string, textCase: TextStyle["textCase"]): string {
  switch (textCase) {
    case "upper":
      return characters.toUpperCase();
    case "lower":
      return characters.toLowerCase();
    case "title":
      return characters.replace(/\b\w/g, (letter) => letter.toUpperCase());
    case "none":
      return characters;
  }
}

/**
 * Renders a TextNode's runs as one <text> element containing a <tspan> per run — SVG's
 * equivalent of "contiguous characters sharing one style," same reasoning as the other
 * two renderers' per-run mapping. `y` is offset by BASELINE_RATIO * fontSizePx of the
 * first run to approximate SVG's baseline anchor from the schema's box-top geometry.
 */
export function renderText(node: TextNode): string {
  const firstRunFontSize = node.content.runs[0]?.style.fontSizePx ?? 0;
  const baselineY = formatNumber(firstRunFontSize * BASELINE_RATIO);
  const textAnchor = node.content.align === "center" ? "middle" : node.content.align === "right" ? "end" : "start";

  const tspans = node.content.runs
    .map((run) => `<tspan ${runAttributes(run.style)}>${escapeXml(applyTextCase(run.characters, run.style.textCase))}</tspan>`)
    .join("");

  return `<text x="0" y="${baselineY}" text-anchor="${textAnchor}">${tspans}</text>`;
}
