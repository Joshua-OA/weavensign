import { z } from "zod";

/** One subpath's geometry, as an SVG-compatible path data string — adapters translate native path formats into this once, at ingest. */
export const VectorPathSchema = z.object({
  data: z.string(),
  windingRule: z.enum(["nonzero", "evenodd"]).default("nonzero"),
});
export type VectorPath = z.infer<typeof VectorPathSchema>;
