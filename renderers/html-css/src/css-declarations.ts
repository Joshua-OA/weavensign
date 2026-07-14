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
 * Maps a Style's fills/strokes/effects to CSS declarations. Solid fills/strokes map
 * directly to background-color/border. Gradient fills have no real fixture data yet
 * (context.md §7 — no accuracy claim, and by extension no rendering shape, should be
 * built from a guess when zero real examples exist to check it against) and are left
 * unrendered, same as before. Image fills are real (17 in the Figma eval fixture) but
 * assetRef is Figma's opaque internal image hash with no asset-resolution layer anywhere
 * in the project yet to turn it into a fetchable URL — rendering a broken <img> src would
 * be worse than nothing, so an image-only fill gets a visible striped placeholder instead,
 * to make the node's presence/geometry legible without pretending to show the real asset.
 */
export function styleDeclarations(style: Style): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];

  const solidFill = style.fills.find((fill) => fill.type === "solid");
  const imageFill = style.fills.find((fill) => fill.type === "image");
  if (solidFill) {
    declarations.push({ prop: "background-color", value: formatColor(solidFill.color) });
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
