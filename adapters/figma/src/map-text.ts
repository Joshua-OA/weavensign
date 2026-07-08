import type { TextContent } from "@weavensign/schema";
import type { RawTextStyle } from "./raw-text.js";

const HORIZONTAL_ALIGN_MAP = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
  JUSTIFIED: "justify",
} as const;

const AUTO_RESIZE_MAP = {
  NONE: "none",
  WIDTH_AND_HEIGHT: "width-and-height",
  HEIGHT: "height",
  TRUNCATE: "truncate",
} as const;

/**
 * Figma's fontStyle is a free-form family-specific style/weight name ("Regular",
 * "SemiBold", "Book", "Black", ...) — the only signal for canonical (CSS-shaped)
 * fontStyle is whether that name mentions "italic", not an exact-match lookup.
 */
function mapFontStyle(rawFontStyle: string | undefined): "normal" | "italic" {
  return rawFontStyle?.toLowerCase().includes("italic") ? "italic" : "normal";
}

const TEXT_DECORATION_MAP = {
  NONE: "none",
  UNDERLINE: "underline",
  STRIKETHROUGH: "strikethrough",
} as const;

const TEXT_CASE_MAP = {
  ORIGINAL: "none",
  UPPER: "upper",
  LOWER: "lower",
  TITLE: "title",
  // Canonical TextStyle has no small-caps variant yet; closest available mapping.
  SMALL_CAPS: "upper",
  SMALL_CAPS_FORCED: "upper",
} as const;

/**
 * Maps Figma's flat `characters` + single `style` into one canonical TextRun. Figma text
 * nodes can carry multiple style ranges via `characterStyleOverrides` + `styleOverrideTable`
 * (per-character style indices); this adapter doesn't parse those overrides yet — every
 * text node becomes a single run using its top-level `style`. Mixed-style runs will parse
 * incorrectly until that's added, tracked as a known adapter gap, not silently guessed at.
 */
export function mapTextContent(characters: string, style: RawTextStyle): TextContent {
  return {
    runs: [
      {
        characters,
        style: {
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          fontStyle: mapFontStyle(style.fontStyle),
          fontSizePx: style.fontSize,
          lineHeightPx: style.lineHeightPx,
          letterSpacingPx: style.letterSpacing,
          textDecoration: style.textDecoration ? TEXT_DECORATION_MAP[style.textDecoration] : "none",
          textCase: style.textCase ? TEXT_CASE_MAP[style.textCase] : "none",
        },
      },
    ],
    align: HORIZONTAL_ALIGN_MAP[style.textAlignHorizontal],
    autoResize: style.textAutoResize ? AUTO_RESIZE_MAP[style.textAutoResize] : "none",
  };
}
