import { z } from "zod";

/** Penpot represents color as a CSS hex string plus a separate opacity float, never inline r/g/b/a — the adapter parses the hex at mapping time. */
export const RawFillSchema = z.object({
  fillColor: z.string().optional(),
  fillOpacity: z.number().optional(),
});
export type RawFill = z.infer<typeof RawFillSchema>;

export const RawStrokeSchema = z.object({
  strokeColor: z.string().optional(),
  strokeOpacity: z.number().optional(),
  strokeWidth: z.number().optional(),
  strokeAlignment: z.enum(["center", "inner", "outer"]).optional(),
  strokeStyle: z.enum(["solid", "dotted", "dashed", "mixed", "none"]).optional(),
});
export type RawStroke = z.infer<typeof RawStrokeSchema>;
