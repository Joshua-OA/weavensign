import { err, ok, type DesignNode, type Result } from "@weavensign/schema";
import { mapNode, type MapNodeError } from "./map-node.js";
import { RawNodesResponseSchema } from "./raw-file-response.js";

export type ParseFigmaNodesError =
  | { kind: "invalid-response"; message: string }
  | { kind: "node-not-found"; nodeId: string }
  | MapNodeError;

/**
 * Parses the JSON body of `GET /v1/files/:key/nodes?ids=...&geometry=paths` into
 * canonical DesignNodes, one per requested node id. `geometry=paths` is required in the
 * request — without it Figma omits `fillGeometry`, and vector/shape nodes map to empty
 * path arrays.
 */
export function parseFigmaNodes(
  rawResponseBody: unknown,
  fileId: string,
  nodeIds: string[],
): Result<DesignNode[], ParseFigmaNodesError> {
  // Trust boundary: this is unvalidated JSON from an external HTTP response. Zod's
  // safeParse below is what actually establishes the shape; nothing downstream trusts
  // rawResponseBody's `unknown` type directly.
  const parsed = RawNodesResponseSchema.safeParse(rawResponseBody);
  if (!parsed.success) {
    return err({ kind: "invalid-response", message: parsed.error.message });
  }

  const nodes: DesignNode[] = [];
  for (const nodeId of nodeIds) {
    const entry = parsed.data.nodes[nodeId];
    if (!entry) {
      return err({ kind: "node-not-found", nodeId });
    }
    const mapped = mapNode(entry.document, { components: entry.components, sourceFileId: fileId });
    if (!mapped.ok) {
      return mapped;
    }
    nodes.push(mapped.value);
  }
  return ok(nodes);
}
