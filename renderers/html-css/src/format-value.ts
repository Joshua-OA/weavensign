import type { Color } from "@weavensign/schema";

const PX_DECIMALS = 2;

/**
 * Rounds a raw geometry/style number to a fixed, deterministic precision. Real design-tool
 * data carries float noise (e.g. Penpot's 39.999999994571226px, see learning_v0.md #023) —
 * rounding here is what keeps renderer output stable and readable rather than re-exposing
 * upstream float drift byte-for-byte.
 */
export function formatPx(value: number): string {
  const rounded = Number(value.toFixed(PX_DECIMALS));
  return `${rounded}px`;
}

/** Same rounding as formatPx, without the unit suffix — for CSS numbers that aren't lengths (e.g. opacity, unitless line-height) and for SVG attribute values (which are bare numbers, not CSS lengths). */
export function formatNumber(value: number): string {
  return String(Number(value.toFixed(PX_DECIMALS)));
}

/** Converts a 0-1 sRGB Color (schema convention) to a CSS rgb()/rgba() string, channels rounded to 0-255 integers. */
export function formatColor(color: Color): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a >= 1) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(color.a.toFixed(2))})`;
}
