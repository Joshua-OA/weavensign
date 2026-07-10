import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { DesignNode } from "@weavensign/schema";
import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "./create-server.js";

async function connectedClient(): Promise<Client> {
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe("createServer", () => {
  let client: Client;

  beforeEach(async () => {
    client = await connectedClient();
  });

  it("registers get_figma_design, get_penpot_page, and classify_roles", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["classify_roles", "get_figma_design", "get_penpot_page"]);
  });

  it("get_figma_design reports a missing-token error as a tool error, not a thrown exception", async () => {
    const previousToken = process.env.FIGMA_TOKEN;
    delete process.env.FIGMA_TOKEN;
    try {
      const result = await client.callTool({ name: "get_figma_design", arguments: { fileKey: "abc", nodeId: "1:2" } });
      expect(result.isError).toBe(true);
    } finally {
      if (previousToken !== undefined) process.env.FIGMA_TOKEN = previousToken;
    }
  });

  it("get_penpot_page reports a missing-token error as a tool error, not a thrown exception", async () => {
    const previousToken = process.env.PENPOT_TOKEN;
    delete process.env.PENPOT_TOKEN;
    try {
      const result = await client.callTool({ name: "get_penpot_page", arguments: { fileId: "abc", pageId: "def" } });
      expect(result.isError).toBe(true);
    } finally {
      if (previousToken !== undefined) process.env.PENPOT_TOKEN = previousToken;
    }
  });

  it("classify_roles returns a role assignment per input node", async () => {
    const nodes: DesignNode[] = [
      {
        id: "1",
        name: "icon",
        visible: true,
        locked: false,
        geometry: { position: { x: 0, y: 0 }, size: { width: 20, height: 20 }, rotationDegrees: 0 },
        type: "vector",
        style: { fills: [], strokes: [], effects: [], opacity: 1, blendMode: "normal" },
        paths: [{ data: "M0 0", windingRule: "nonzero" }],
      },
    ];
    const result = await client.callTool({ name: "classify_roles", arguments: { nodes } });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const assignments = JSON.parse(content[0]!.text) as Array<{ nodeId: string; role: string }>;
    expect(assignments).toEqual([{ nodeId: "1", role: "icon", confidence: expect.any(Number) }]);
  });
});
