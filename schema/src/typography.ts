import { z } from "zod";
import { ColorSchema } from "./style.js";

export const TextAlignSchema = z.enum(["left", "center", "right", "justify"]);

/** Character-level formatting applied to a run of text within a TextNode. */
export const TextStyleSchema = z.object({
  fontFamily: z.string(),
  fontWeight: z.number().int().min(1).max(1000),
  fontStyle: z.enum(["normal", "italic"]).default("normal"),
  fontSizePx: z.number().positive(),
  lineHeightPx: z.number().positive().optional(),
  letterSpacingPx: z.number().default(0),
  color: ColorSchema.optional(),
  textDecoration: z.enum(["none", "underline", "strikethrough"]).default("none"),
  textCase: z.enum(["none", "upper", "lower", "title"]).default("none"),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

/** A contiguous run of characters sharing one TextStyle. Concatenating `characters` across runs yields the full string. */
export const TextRunSchema = z.object({
  characters: z.string(),
  style: TextStyleSchema,
});
export type TextRun = z.infer<typeof TextRunSchema>;

export const TextContentSchema = z.object({
  runs: z.array(TextRunSchema).min(1),
  align: TextAlignSchema.default("left"),
  autoResize: z.enum(["none", "width-and-height", "height", "truncate"]).default("none"),
});
export type TextContent = z.infer<typeof TextContentSchema>;
