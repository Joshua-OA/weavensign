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
});
export type RawTextStyle = z.infer<typeof RawTextStyleSchema>;
