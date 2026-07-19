import { assertNever, err, ok, type DesignNode, type Fill, type Result } from "@weavensign/schema";
import { RawImageFillsResponseSchema } from "./raw-image-fills-response.js";

export type ResolveImageFillsError = { kind: "invalid-response"; message: string };

function childrenOf(node: DesignNode): DesignNode[] {
  switch (node.type) {
    case "frame":
    case "group":
    case "component":
    case "component-instance":
      return node.children;
    case "text":
    case "vector":
      return [];
    default:
      return assertNever(node);
  }
}

function resolveFill(fill: Fill, urlsByRef: Map<string, string>): Fill {
  if (fill.type !== "image") {
    return fill;
  }
  const resolvedUrl = urlsByRef.get(fill.assetRef);
  if (!resolvedUrl) {
    return fill;
  }
  return { ...fill, assetRef: resolvedUrl };
}

function resolveNode(node: DesignNode, urlsByRef: Map<string, string>): DesignNode {
  const withResolvedFills =
    "style" in node ? { ...node, style: { ...node.style, fills: node.style.fills.map((fill) => resolveFill(fill, urlsByRef)) } } : node;
  const children = childrenOf(withResolvedFills);
  if (children.length === 0) {
    return withResolvedFills;
  }
  return { ...withResolvedFills, children: children.map((child) => resolveNode(child, urlsByRef)) } as DesignNode;
}

/**
 * Substitutes real, fetchable URLs for `ImageFillSchema.assetRef` wherever the raw
 * `GET /v1/files/:key/images` response resolves that ref — `assetRef` starts out as
 * Figma's opaque internal image hash (passed through unresolved by `map-paint.ts`,
 * `imageRef`); this is the second, separate API call needed to turn that hash into
 * something a renderer can actually fetch/display, per the gap named in
 * learning_v0.md #031/#037-#039's "no asset-resolution layer exists" note across all
 * three renderers. Refs with no match in the response (or an explicitly null resolution
 * — see raw-image-fills-response.ts) are left as their original hash, unchanged; a
 * renderer distinguishes "resolved" from "still a raw hash" by checking whether
 * `assetRef` looks like a URL, not via a schema-level flag (kept schema stable —
 * `ImageFillSchema` is unchanged, no version bump needed for this step).
 */
export function resolveImageFills(nodes: DesignNode[], rawImageFillsResponse: unknown): Result<DesignNode[], ResolveImageFillsError> {
  // Trust boundary: unvalidated JSON from an external HTTP response. Zod's safeParse
  // below establishes the shape; nothing downstream trusts rawImageFillsResponse's
  // `unknown` type directly.
  const parsed = RawImageFillsResponseSchema.safeParse(rawImageFillsResponse);
  if (!parsed.success) {
    return err({ kind: "invalid-response", message: parsed.error.message });
  }

  const urlsByRef = new Map<string, string>();
  for (const [ref, url] of Object.entries(parsed.data.meta.images)) {
    if (url) {
      urlsByRef.set(ref, url);
    }
  }

  return ok(nodes.map((node) => resolveNode(node, urlsByRef)));
}
