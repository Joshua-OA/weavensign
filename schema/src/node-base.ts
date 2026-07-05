import { z } from "zod";
import { GeometrySchema } from "./geometry.js";

/** Where a node came from, so an adapter's output can be traced back to its source file/node without holding a reference to the raw response (see context.md §4.4). */
export const ProvenanceSchema = z.object({
  source: z.enum(["figma", "penpot"]),
  sourceNodeId: z.string(),
  sourceFileId: z.string().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** Fields every DesignNode variant carries regardless of type. Node-specific schemas extend this with `.extend(...)`. */
export const BaseNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  geometry: GeometrySchema,
  provenance: ProvenanceSchema.optional(),
});
export type BaseNode = z.infer<typeof BaseNodeSchema>;
