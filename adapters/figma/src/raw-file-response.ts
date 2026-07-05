import { z } from "zod";
import { RawNodeSchema } from "./raw-node.js";

/** One entry from the REST response's file-scoped `components` map: definition metadata keyed by node id. */
export const RawComponentMetaSchema = z.object({
  key: z.string(),
  name: z.string(),
  componentSetId: z.string().optional(),
});
export type RawComponentMeta = z.infer<typeof RawComponentMetaSchema>;

/** One entry under `GET /v1/files/:key/nodes?ids=...`'s top-level `nodes` map. */
export const RawNodesResponseEntrySchema = z.object({
  document: RawNodeSchema,
  components: z.record(z.string(), RawComponentMetaSchema).default({}),
});
export type RawNodesResponseEntry = z.infer<typeof RawNodesResponseEntrySchema>;

/** Full shape of `GET /v1/files/:key/nodes?ids=...`, restricted to the fields the adapter reads. */
export const RawNodesResponseSchema = z.object({
  nodes: z.record(z.string(), RawNodesResponseEntrySchema),
});
export type RawNodesResponse = z.infer<typeof RawNodesResponseSchema>;
