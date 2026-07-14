import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CLASSIFY_ROLES_INPUT_SHAPE, classifyRoles } from "./tools/classify-roles.js";
import { GET_FIGMA_DESIGN_INPUT_SHAPE, getFigmaDesign } from "./tools/get-figma-design.js";
import { GET_PENPOT_PAGE_INPUT_SHAPE, getPenpotPage } from "./tools/get-penpot-page.js";

/** Builds the weavensign MCP server with every tool registered, unconnected to any transport. */
export function createServer(): McpServer {
  const server = new McpServer({ name: "weavensign", version: "0.1.0" });

  server.registerTool(
    "get_figma_design",
    {
      title: "Get Figma design",
      description: "Fetch a Figma node (and its descendants) and map it into the canonical DesignNode schema.",
      inputSchema: GET_FIGMA_DESIGN_INPUT_SHAPE,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    getFigmaDesign,
  );

  server.registerTool(
    "get_penpot_page",
    {
      title: "Get Penpot page",
      description: "Fetch a Penpot page and map its shape graph into the canonical DesignNode schema.",
      inputSchema: GET_PENPOT_PAGE_INPUT_SHAPE,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    getPenpotPage,
  );

  server.registerTool(
    "classify_roles",
    {
      title: "Classify node roles",
      description: "Run the normalization heuristics against a DesignNode tree, returning a role assignment per node.",
      inputSchema: CLASSIFY_ROLES_INPUT_SHAPE,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    classifyRoles,
  );

  return server;
}
