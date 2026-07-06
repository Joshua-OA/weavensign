import type { TextContent, TextRun } from "@weavensign/schema";
import { mapFills } from "./map-paint.js";
import type { RawTextContent, RawTextLeaf } from "./raw-text.js";

const TEXT_ALIGN_MAP = { left: "left", center: "center", right: "right", justify: "justify" } as const;

function mapLeaf(leaf: RawTextLeaf): TextRun {
  const color = mapFills(leaf.fills)[0];
  return {
    characters: leaf.text,
    style: {
      fontFamily: leaf.fontFamily ?? "sans-serif",
      fontWeight: leaf.fontWeight ? Number.parseInt(leaf.fontWeight, 10) : 400,
      fontStyle: leaf.fontStyle ?? "normal",
      fontSizePx: leaf.fontSize ? Number.parseFloat(leaf.fontSize) : 16,
      letterSpacingPx: leaf.letterSpacing ? Number.parseFloat(leaf.letterSpacing) : 0,
      textDecoration: leaf.textDecoration === "line-through" ? "strikethrough" : (leaf.textDecoration ?? "none"),
      textCase: "none",
      ...(color?.type === "solid" ? { color: color.color } : {}),
    },
  };
}

/**
 * Flattens Penpot's paragraph-tree text content into canonical runs, one run per leaf
 * across every paragraph — this loses paragraph-break information (no equivalent field
 * in canonical TextContent yet), a known gap tracked in the README, not silently guessed.
 */
export function mapTextContent(content: RawTextContent): TextContent {
  const runs: TextRun[] = [];
  let align: "left" | "center" | "right" | "justify" = "left";

  for (const paragraphSet of content.children) {
    for (const paragraph of paragraphSet.children) {
      for (const leaf of paragraph.children) {
        runs.push(mapLeaf(leaf));
        if (leaf.textAlign) {
          align = TEXT_ALIGN_MAP[leaf.textAlign];
        }
      }
    }
  }

  if (runs.length === 0) {
    runs.push({
      characters: "",
      style: {
        fontFamily: "sans-serif",
        fontWeight: 400,
        fontStyle: "normal",
        fontSizePx: 16,
        letterSpacingPx: 0,
        textDecoration: "none",
        textCase: "none",
      },
    });
  }

  return { runs, align, autoResize: "none" };
}
