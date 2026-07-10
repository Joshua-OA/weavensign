import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolResult = CallToolResult;

/** Wraps a JSON-serializable value as a successful MCP tool result. */
export function jsonToolResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** Wraps a human-readable message as a failed MCP tool result (§4.6: routine failures are values, surfaced to the client rather than thrown). */
export function errorToolResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
