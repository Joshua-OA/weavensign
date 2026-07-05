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

const FONT_STYLE_MAP: Record<string, "normal" | "italic"> = {
  Italic: "italic",
  "Bold Italic": "italic",
};

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
          fontStyle: style.fontStyle ? (FONT_STYLE_MAP[style.fontStyle] ?? "normal") : "normal",
          fontSizePx: style.fontSize,
          lineHeightPx: style.lineHeightPx,
          letterSpacingPx: style.letterSpacing,
          textDecoration: "none",
          textCase: "none",
        },
      },
    ],
    align: HORIZONTAL_ALIGN_MAP[style.textAlignHorizontal],
    autoResize: style.textAutoResize ? AUTO_RESIZE_MAP[style.textAutoResize] : "none",
  };
}
