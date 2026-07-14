import { formatColor, formatNumber } from "@weavensign/renderer-shared";
import type { Style } from "@weavensign/schema";

export interface SvgAttribute {
  name: string;
  value: string;
}

const PLACEHOLDER_FILL = "#e5e5e5";

/**
 * Maps a Style's fills/strokes/opacity to SVG presentation attributes (`fill`, `stroke`,
 * `stroke-width`, `opacity`) — a different attribute model than CSS's box-model
 * properties (`background-color`, `border`), so this doesn't reuse
 * `@weavensign/renderer-shared`'s `styleDeclarations` (that function's output is
 * CSS-shaped, not applicable to SVG shape attributes). Only reuses that package's
 * `formatColor`/`formatNumber` — the actual color/number rounding rules, which are
 * genuinely format-agnostic. Same fill-priority and known-gap rules as the other two
 * renderers: gradient fills have zero real fixture examples (context.md §7) and are left
 * unmapped; image fills get a flat placeholder color, the closest SVG-attribute
 * equivalent of the other renderers' striped CSS placeholder (SVG has no
 * `repeating-linear-gradient` shorthand — expressing the same stripe pattern would need a
 * `<pattern>` def, out of scope for a "this asset can't be resolved yet" placeholder).
 */
export function styleAttributes(style: Style): SvgAttribute[] {
  const attributes: SvgAttribute[] = [];

  const solidFill = style.fills.find((fill) => fill.type === "solid");
  const imageFill = style.fills.find((fill) => fill.type === "image");
  if (solidFill) {
    attributes.push({ name: "fill", value: formatColor(solidFill.color) });
  } else if (imageFill) {
    attributes.push({ name: "fill", value: PLACEHOLDER_FILL });
  } else {
    attributes.push({ name: "fill", value: "none" });
  }

  const solidStroke = style.strokes.find((stroke) => stroke.fill.type === "solid");
  if (solidStroke && solidStroke.fill.type === "solid") {
    attributes.push({ name: "stroke", value: formatColor(solidStroke.fill.color) });
    attributes.push({ name: "stroke-width", value: formatNumber(solidStroke.weight) });
  }

  if (style.opacity !== 1) {
    attributes.push({ name: "opacity", value: formatNumber(style.opacity) });
  }

  return attributes;
}

export function attributesToXml(attributes: SvgAttribute[]): string {
  return attributes.map((attribute) => `${attribute.name}="${attribute.value}"`).join(" ");
}
