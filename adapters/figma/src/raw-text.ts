import { z } from "zod";

export const RawTextStyleSchema = z.object({
  fontFamily: z.string(),
  fontWeight: z.number(),
  fontStyle: z.enum(["Regular", "Bold", "Italic", "Bold Italic", "Medium", "Light"]).optional(),
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
