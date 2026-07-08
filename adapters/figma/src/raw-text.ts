import { z } from "zod";

export const RawTextStyleSchema = z.object({
  fontFamily: z.string(),
  fontWeight: z.number(),
  // Figma's fontStyle is the font family's own style/weight name (e.g. "Regular",
  // "SemiBold", "Book", "Black") — free-form per family, not a fixed set of values.
  fontStyle: z.string().optional(),
  fontSize: z.number(),
  textAlignHorizontal: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]),
  letterSpacing: z.number(),
  lineHeightPx: z.number(),
  textAutoResize: z.enum(["NONE", "WIDTH_AND_HEIGHT", "HEIGHT", "TRUNCATE"]).optional(),
  // Figma only includes these two when non-default — absent means NONE/ORIGINAL.
  textDecoration: z.enum(["NONE", "UNDERLINE", "STRIKETHROUGH"]).optional(),
  textCase: z.enum(["ORIGINAL", "UPPER", "LOWER", "TITLE", "SMALL_CAPS", "SMALL_CAPS_FORCED"]).optional(),
});
export type RawTextStyle = z.infer<typeof RawTextStyleSchema>;
