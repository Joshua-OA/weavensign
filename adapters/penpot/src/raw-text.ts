import { z } from "zod";
import { RawFillSchema } from "./raw-paint.js";

/**
 * Penpot text content is a small ProseMirror-shaped tree (root -> paragraph-set ->
 * paragraph -> text leaves), not Figma's flat characters+style. Font metrics on leaves
 * are strings ("13", "400"), not numbers — Penpot's own editor treats them as CSS values.
 */
export const RawTextLeafSchema = z.object({
  text: z.string(),
  fontFamily: z.string().optional(),
  fontSize: z.string().optional(),
  fontWeight: z.string().optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
  letterSpacing: z.string().optional(),
  lineHeight: z.string().optional(),
  fills: z.array(RawFillSchema).optional(),
});
export type RawTextLeaf = z.infer<typeof RawTextLeafSchema>;

export const RawParagraphSchema = z.object({
  type: z.literal("paragraph"),
  children: z.array(RawTextLeafSchema),
});

export const RawParagraphSetSchema = z.object({
  type: z.literal("paragraph-set"),
  children: z.array(RawParagraphSchema),
});

export const RawTextContentSchema = z.object({
  type: z.literal("root"),
  children: z.array(RawParagraphSetSchema),
});
export type RawTextContent = z.infer<typeof RawTextContentSchema>;
