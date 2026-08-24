import { parsePenpotPage } from "@weavensign/adapter-penpot";
import { z } from "zod";
import { resolveToken } from "../credentials.js";
import { fetchPenpotPage } from "../penpot-client.js";
import { errorToolResult, jsonToolResult, type ToolResult } from "./tool-result.js";

export const GET_PENPOT_PAGE_INPUT_SHAPE = {
  fileId: z.string().describe("Penpot file id"),
  pageId: z.string().describe("Penpot page id, from data.pagesIndex"),
};

const GetPenpotPageInputSchema = z.object(GET_PENPOT_PAGE_INPUT_SHAPE);
export type GetPenpotPageInput = z.infer<typeof GetPenpotPageInputSchema>;

/**
 * Fetches one Penpot page via the get-file RPC command and maps its shape graph into the
 * canonical DesignNode schema. Token comes from resolveToken("penpot") — PENPOT_TOKEN env
 * var first, then the persistent store written by the setup command.
 */
export async function getPenpotPage(input: GetPenpotPageInput): Promise<ToolResult> {
  const fetched = await fetchPenpotPage(input.fileId, input.pageId, await resolveToken("penpot"));
  if (!fetched.ok) {
    if (fetched.error.kind === "missing-token") {
      return errorToolResult(
        "No Penpot token found. Run `npx @weavensign/mcp-server setup` to configure one, or set PENPOT_TOKEN in the server's environment.",
      );
    }
    if (fetched.error.kind === "page-not-found") {
      return errorToolResult(`Page ${fetched.error.pageId} not found in file ${input.fileId}.`);
    }
    return errorToolResult(`Penpot API error (${fetched.error.status}): ${fetched.error.body}`);
  }

  const parsed = parsePenpotPage(fetched.value.objects, fetched.value.components, input.fileId);
  if (!parsed.ok) {
    return errorToolResult(`Adapter error: ${JSON.stringify(parsed.error)}`);
  }

  return jsonToolResult(parsed.value);
}
