import { formatColor, formatNumber } from "@weavensign/renderer-shared";
import type { Style } from "@weavensign/schema";

export interface SvgAttribute {
  name: string;
  value: string;
}

const PLACEHOLDER_FILL = "#e5e5e5";

/**
 * True when an ImageFill's assetRef has been resolved to a real, fetchable URL rather
 * than left as Figma's raw opaque image hash — same check as
 * `@weavensign/renderer-shared`'s (own copy here, not imported, since this package's
 * whole style-attribute model is deliberately independent of that package's CSS-shaped
 * one; see this file's other doc comment). A resolved image fill can't be expressed as
 * a `fill` attribute at all (SVG shapes can't paint a raster URL as a fill the way a CSS
 * box can with `background-image`) — render-node.ts checks this directly to decide
 * whether to emit a real `<image>` element instead of a `<rect fill="...">`.
 */
export function isResolvedImageUrl(assetRef: string): boolean {
  return assetRef.startsWith("http://") || assetRef.startsWith("https://");
}

/**
 * Maps a Style's fills/strokes/opacity to SVG presentation attributes (`fill`, `stroke`,
 * `stroke-width`, `opacity`) — a different attribute model than CSS's box-model
 * properties (`background-color`, `border`), so this doesn't reuse
 * `@weavensign/renderer-shared`'s `styleDeclarations` (that function's output is
 * CSS-shaped, not applicable to SVG shape attributes). Only reuses that package's
 * `formatColor`/`formatNumber` — the actual color/number rounding rules, which are
 * genuinely format-agnostic. Same fill-priority and known-gap rules as the other two
 * renderers: gradient fills have zero real fixture examples (context.md §7) and are left
 * unmapped; an unresolved image fill gets a flat placeholder color, the closest
 * SVG-attribute equivalent of the other renderers' striped CSS placeholder (SVG has no
 * `repeating-linear-gradient` shorthand — expressing the same stripe pattern would need a
 * `<pattern>` def, out of scope for a "this asset can't be resolved yet" placeholder). A
 * resolved image fill emits no `fill` attribute at all here — render-node.ts renders it
 * as a real `<image>` element instead, since `fill` can't reference a raster URL.
 */
export function styleAttributes(style: Style): SvgAttribute[] {
  const attributes: SvgAttribute[] = [];

  const solidFill = style.fills.find((fill) => fill.type === "solid");
  const imageFill = style.fills.find((fill) => fill.type === "image");
  if (solidFill) {
    attributes.push({ name: "fill", value: formatColor(solidFill.color) });
  } else if (imageFill && isResolvedImageUrl(imageFill.assetRef)) {
    // No `fill` attribute — render-node.ts emits a real <image> element for this case,
    // not a filled <rect>.
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

/**
 * Maps ImageFillSchema.scaleMode to SVG's <image> `preserveAspectRatio` attribute. Same
 * real-data scope as `@weavensign/renderer-shared`'s `imageScaleDeclarations` (11
 * `fill` / 5 `stretch` / 1 `tile` real fixture examples; `fit`/`crop` have zero and fall
 * back to the same treatment as `fill`, not an invented shape). `tile` has no real
 * `preserveAspectRatio` equivalent at all — SVG's `<image>` element doesn't repeat/tile
 * its content the way CSS `background-repeat` does; expressing real tiling would need a
 * `<pattern>` def wrapping the image, out of scope for this pass (same class of gap as
 * the placeholder-fill stripe pattern) — falls back to `xMidYMid slice` (crop-to-fill,
 * SVG's own default) rather than attempting to fake tiling.
 */
export function imagePreserveAspectRatio(scaleMode: "fill" | "fit" | "crop" | "tile" | "stretch"): string {
  switch (scaleMode) {
    case "stretch":
      return "none";
    case "fill":
    case "fit":
    case "crop":
    case "tile":
      return "xMidYMid slice";
  }
}
