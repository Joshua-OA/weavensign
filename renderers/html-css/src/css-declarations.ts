import type { Geometry, Style } from "@weavensign/schema";
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

/** Maps a solid-fill-only Style to CSS background/border/opacity declarations. Gradient and image fills are handled separately (see render-node.ts) since CSS background-image syntax differs from a flat color. */
export function styleDeclarations(style: Style): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];

  const solidFill = style.fills.find((fill) => fill.type === "solid");
  if (solidFill) {
    declarations.push({ prop: "background-color", value: formatColor(solidFill.color) });
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
