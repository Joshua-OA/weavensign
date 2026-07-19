import { parseFigmaNodes, resolveImageFills } from "@weavensign/adapter-figma";
import { assertNever, type DesignNode } from "@weavensign/schema";
import { z } from "zod";
import { fetchFigmaImageFills, fetchFigmaNodes } from "../figma-client.js";
import { errorToolResult, jsonToolResult, type ToolResult } from "./tool-result.js";

export const GET_FIGMA_DESIGN_INPUT_SHAPE = {
  fileKey: z.string().describe("Figma file key, from the file's URL (figma.com/file/<fileKey>/...)"),
  nodeId: z.string().describe("Figma node id to fetch, e.g. \"1:23\""),
};

const GetFigmaDesignInputSchema = z.object(GET_FIGMA_DESIGN_INPUT_SHAPE);
export type GetFigmaDesignInput = z.infer<typeof GetFigmaDesignInputSchema>;

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

function hasImageFill(node: DesignNode): boolean {
  const ownFill = "style" in node && node.style.fills.some((fill) => fill.type === "image");
  return ownFill || childrenOf(node).some((child) => hasImageFill(child));
}

/**
 * Fetches one Figma node (and its descendants) via the REST API and maps it into the
 * canonical DesignNode schema. Requires FIGMA_TOKEN in the server's environment.
 *
 * If the tree has any image fills, makes a second call to resolve their `assetRef`
 * (Figma's opaque internal image hash) into a real, fetchable URL — see
 * @weavensign/adapter-figma's resolveImageFills doc comment. Resolution is treated as an
 * enhancement, not a requirement: if it fails for any reason (token lacks scope, rate
 * limit, network error), the tool still returns the successfully-parsed nodes with their
 * image fills left as unresolved hashes (the same placeholder-rendering path every
 * renderer already has), rather than failing an otherwise-successful call over a
 * secondary request (context.md §4.6: routine failures are values, not exceptions —
 * choosing not to propagate this one as a tool-call failure is itself a deliberate
 * handling of that value, not a silently swallowed error).
 */
export async function getFigmaDesign(input: GetFigmaDesignInput): Promise<ToolResult> {
  const fetched = await fetchFigmaNodes(input.fileKey, input.nodeId, process.env.FIGMA_TOKEN);
  if (!fetched.ok) {
    if (fetched.error.kind === "missing-token") {
      return errorToolResult("FIGMA_TOKEN is not set in the server's environment.");
    }
    return errorToolResult(`Figma API error (${fetched.error.status}): ${fetched.error.body}`);
  }

  const parsed = parseFigmaNodes(fetched.value, input.fileKey, [input.nodeId]);
  if (!parsed.ok) {
    return errorToolResult(`Adapter error: ${JSON.stringify(parsed.error)}`);
  }

  if (!parsed.value.some((node) => hasImageFill(node))) {
    return jsonToolResult(parsed.value);
  }

  const fetchedImageFills = await fetchFigmaImageFills(input.fileKey, process.env.FIGMA_TOKEN);
  if (!fetchedImageFills.ok) {
    return jsonToolResult(parsed.value);
  }
  const resolved = resolveImageFills(parsed.value, fetchedImageFills.value);
  return jsonToolResult(resolved.ok ? resolved.value : parsed.value);
}
