import { err, ok, type DesignNode, type Result } from "@weavensign/schema";
import { mapNode, type MapNodeError } from "./map-node.js";
import { ROOT_FRAME_ID, RawComponentsMapSchema, RawObjectsMapSchema } from "./raw-shape.js";

export type ParsePenpotPageError =
  | { kind: "invalid-objects"; message: string }
  | { kind: "invalid-components"; message: string }
  | MapNodeError;

/**
 * Parses one Penpot page's `objects` map (from `GET`/RPC `get-file`'s
 * `data.pagesIndex[pageId]`) into canonical DesignNodes. Penpot's page is a flat
 * id-keyed map, not a nested tree — this walks it starting from the root frame's direct
 * children (the root frame itself is Penpot's synthetic page container and isn't
 * represented as a DesignNode).
 */
export function parsePenpotPage(
  rawObjects: unknown,
  rawComponents: unknown,
  fileId: string,
): Result<DesignNode[], ParsePenpotPageError> {
  // Trust boundary: unvalidated JSON from an external HTTP response. Zod's safeParse
  // below establishes the shape; nothing downstream trusts these `unknown` values directly.
  const objectsParsed = RawObjectsMapSchema.safeParse(rawObjects);
  if (!objectsParsed.success) {
    return err({ kind: "invalid-objects", message: objectsParsed.error.message });
  }
  const componentsParsed = RawComponentsMapSchema.safeParse(rawComponents ?? {});
  if (!componentsParsed.success) {
    return err({ kind: "invalid-components", message: componentsParsed.error.message });
  }

  const rootFrame = objectsParsed.data[ROOT_FRAME_ID];
  if (!rootFrame) {
    return err({ kind: "invalid-objects", message: `root frame ${ROOT_FRAME_ID} not found in objects map` });
  }

  const nodes: DesignNode[] = [];
  for (const childId of rootFrame.shapes ?? []) {
    const child = objectsParsed.data[childId];
    if (!child) {
      return err({ kind: "shape-not-found", shapeId: childId });
    }
    const result = mapNode(child, undefined, {
      objects: objectsParsed.data,
      components: componentsParsed.data,
      sourceFileId: fileId,
    });
    if (!result.ok) return result;
    nodes.push(result.value);
  }
  return ok(nodes);
}
