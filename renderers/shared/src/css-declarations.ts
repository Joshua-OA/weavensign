import type { Geometry, Style, TextContent } from "@weavensign/schema";
import { formatColor, formatNumber, formatPx } from "./format-value.js";

export interface CssDeclaration {
  prop: string;
  value: string;
}

/**
 * Every node is absolutely positioned within its parent's local box, per PositionSchema's
 * parent-relative convention (schema/src/geometry.ts). `position: absolute` here also
 * establishes a positioned-ancestor context for the node's own children (see
 * render-node.ts's containerDeclarations), so this composes correctly at any depth without
 * a separate `position: relative` declaration anywhere.
 */
export function geometryDeclarations(geometry: Geometry): CssDeclaration[] {
  const declarations: CssDeclaration[] = [
    { prop: "position", value: "absolute" },
    { prop: "left", value: formatPx(geometry.position.x) },
    { prop: "top", value: formatPx(geometry.position.y) },
    { prop: "width", value: formatPx(geometry.size.width) },
    { prop: "height", value: formatPx(geometry.size.height) },
  ];
  if (geometry.rotationDegrees !== 0) {
    declarations.push({ prop: "transform", value: `rotate(${formatNumber(geometry.rotationDegrees)}deg)` });
  }
  return declarations;
}

/**
 * Text-node geometry, adjusted for TextContent.autoResize (schema/src/typography.ts).
 * `width-and-height` is Figma/Penpot's "hug contents" mode — the node's box tracks the
 * rendered text size, so a fixed px width/height from the source geometry would fight the
 * browser's own text layout; `width: auto; height: auto` lets the box size to content
 * instead. `none` (a fixed-size box, the only other real value seen in the eval fixtures —
 * `height` and `truncate` have zero real examples so far, per context.md §7's rule against
 * building from a guess) keeps the ordinary fixed geometryDeclarations behavior.
 */
export function textDeclarations(geometry: Geometry, align: TextContent["align"], autoResize: TextContent["autoResize"]): CssDeclaration[] {
  const declarations = geometryDeclarations(geometry);
  if (autoResize === "width-and-height") {
    for (const declaration of declarations) {
      if (declaration.prop === "width" || declaration.prop === "height") {
        declaration.value = "auto";
      }
    }
  }
  declarations.push({ prop: "text-align", value: align });
  return declarations;
}

const PLACEHOLDER_FILL_CSS: readonly CssDeclaration[] = [
  { prop: "background-color", value: "rgb(229, 229, 229)" },
  {
    prop: "background-image",
    value:
      "repeating-linear-gradient(45deg, rgb(200, 200, 200) 0px, rgb(200, 200, 200) 8px, transparent 8px, transparent 16px)",
  },
];

/**
 * True when an ImageFill's assetRef has been resolved to a real, fetchable URL rather
 * than left as Figma's raw opaque image hash — see
 * @weavensign/adapter-figma's resolveImageFills. Checking the ref's own shape (does it
 * look like a URL) rather than a separate schema field keeps ImageFillSchema unchanged
 * (no version bump needed for this) — a renderer that receives an unresolved tree (no
 * resolution step run, or a source other than Figma) sees a plain hash and falls back to
 * the placeholder automatically, with no special-casing needed on the caller's side.
 */
function isResolvedImageUrl(assetRef: string): boolean {
  return assetRef.startsWith("http://") || assetRef.startsWith("https://");
}

/**
 * Maps ImageFillSchema.scaleMode to CSS background-size/background-repeat. Only `fill`,
 * `stretch`, and `tile` have real fixture examples (11/5/1 in the Figma eval fixture,
 * respectively) — `fit` and `crop` have zero, so per context.md §7's rule against
 * building a mapping from a guess when no real data exists to check it against, they
 * fall back to the same treatment as `fill` (the closest CSS default, `background-size:
 * cover`) rather than inventing an untested shape for them.
 */
function imageScaleDeclarations(scaleMode: "fill" | "fit" | "crop" | "tile" | "stretch"): CssDeclaration[] {
  switch (scaleMode) {
    case "stretch":
      return [{ prop: "background-size", value: "100% 100%" }];
    case "tile":
      return [
        { prop: "background-size", value: "auto" },
        { prop: "background-repeat", value: "repeat" },
      ];
    case "fill":
    case "fit":
    case "crop":
      return [{ prop: "background-size", value: "cover" }];
  }
}

/**
 * Maps a Style's fills/strokes/effects to CSS declarations. Solid fills/strokes map
 * directly to background-color/border. Gradient fills have no real fixture data yet
 * (context.md §7 — no accuracy claim, and by extension no rendering shape, should be
 * built from a guess when zero real examples exist to check it against) and are left
 * unrendered, same as before. Image fills render the real asset via `background-image:
 * url(...)` once resolved to a real URL (isResolvedImageUrl); an unresolved fill (still
 * Figma's opaque internal image hash — no resolution step run, or a source that doesn't
 * support one) falls back to a visible striped placeholder, so the node's presence/
 * geometry stays legible without pretending to show an asset that can't be fetched.
 */
export function styleDeclarations(style: Style): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];

  const solidFill = style.fills.find((fill) => fill.type === "solid");
  const imageFill = style.fills.find((fill) => fill.type === "image");
  if (solidFill) {
    declarations.push({ prop: "background-color", value: formatColor(solidFill.color) });
  } else if (imageFill && isResolvedImageUrl(imageFill.assetRef)) {
    declarations.push({ prop: "background-image", value: `url("${imageFill.assetRef}")` });
    declarations.push(...imageScaleDeclarations(imageFill.scaleMode));
  } else if (imageFill) {
    declarations.push(...PLACEHOLDER_FILL_CSS);
  }

  const solidStroke = style.strokes.find((stroke) => stroke.fill.type === "solid");
  if (solidStroke && solidStroke.fill.type === "solid") {
    declarations.push({ prop: "border", value: `${formatPx(solidStroke.weight)} solid ${formatColor(solidStroke.fill.color)}` });
  }

  if (style.opacity !== 1) {
    declarations.push({ prop: "opacity", value: formatNumber(style.opacity) });
  }
  if (style.cornerRadius !== undefined) {
    declarations.push({ prop: "border-radius", value: formatPx(style.cornerRadius) });
  }
  if (style.blendMode !== "normal") {
    declarations.push({ prop: "mix-blend-mode", value: style.blendMode });
  }

  const dropShadows = style.effects.filter((effect) => effect.type === "drop-shadow");
  if (dropShadows.length > 0) {
    const shadowValue = dropShadows
      .map((shadow) => `${formatPx(shadow.offset.x)} ${formatPx(shadow.offset.y)} ${formatPx(shadow.blur)} ${formatPx(shadow.spread)} ${formatColor(shadow.color)}`)
      .join(", ");
    declarations.push({ prop: "box-shadow", value: shadowValue });
  }

  return declarations;
}
