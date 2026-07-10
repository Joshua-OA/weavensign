import { parseFigmaNodes } from "@weavensign/adapter-figma";
import { z } from "zod";
import { fetchFigmaNodes } from "../figma-client.js";
import { errorToolResult, jsonToolResult, type ToolResult } from "./tool-result.js";

export const GET_FIGMA_DESIGN_INPUT_SHAPE = {
  fileKey: z.string().describe("Figma file key, from the file's URL (figma.com/file/<fileKey>/...)"),
  nodeId: z.string().describe("Figma node id to fetch, e.g. \"1:23\""),
};

const GetFigmaDesignInputSchema = z.object(GET_FIGMA_DESIGN_INPUT_SHAPE);
export type GetFigmaDesignInput = z.infer<typeof GetFigmaDesignInputSchema>;

/**
 * Fetches one Figma node (and its descendants) via the REST API and maps it into the
 * canonical DesignNode schema. Requires FIGMA_TOKEN in the server's environment.
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

  return jsonToolResult(parsed.value);
}
