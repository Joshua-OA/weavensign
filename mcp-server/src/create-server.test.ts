import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { DesignNode } from "@weavensign/schema";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "./create-server.js";

// Auto-connect is mocked at the module boundary so tests control whether the "seamless
// browser login" path reports success; the real implementation needs a TTY + browser.
let connectOutcome = false;
let connectAttempts = 0;
vi.mock("./connect-figma.js", () => ({
  ensureFigmaConnected: () => {
    connectAttempts += 1;
    return connectOutcome;
  },
}));

/**
 * Points the credential store at an empty throwaway dir so resolveToken can't fall back
 * to a developer's real ~/.weavensign tokens during tests that expect "no token".
 */
function isolateCredentialStore(): void {
  process.env.WEAVENSIGN_CONFIG_DIR = join(mkdtempSync(join(tmpdir(), "ws-test-")), "config");
}

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

  it("registers get_figma_design, get_penpot_page, classify_roles, and render_design", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["classify_roles", "get_figma_design", "get_penpot_page", "render_design"]);
  });

  it("get_figma_design reports a missing-token error as a tool error, not a thrown exception", async () => {
    isolateCredentialStore();
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
    isolateCredentialStore();
    const previousToken = process.env.PENPOT_TOKEN;
    delete process.env.PENPOT_TOKEN;
    try {
      const result = await client.callTool({ name: "get_penpot_page", arguments: { fileId: "abc", pageId: "def" } });
      expect(result.isError).toBe(true);
    } finally {
      if (previousToken !== undefined) process.env.PENPOT_TOKEN = previousToken;
    }
  });

  it("get_figma_design attempts the automatic browser connection on missing token, then retries", async () => {
    isolateCredentialStore();
    connectOutcome = true;
    connectAttempts = 0;
    try {
      // The mocked connection "succeeds" but stores no real credentials, so the retried
      // fetch legitimately ends in missing-token again — what matters here is that the
      // tool ENGAGED the auto-connect path exactly once and did retry instead of
      // giving up after the first fetch.
      await client.callTool({ name: "get_figma_design", arguments: { fileKey: "abc", nodeId: "1:2" } });
      expect(connectAttempts).toBe(1);
    } finally {
      connectOutcome = false;
    }
  });

  it("get_figma_design does not engage auto-connect when credentials exist (env var wins)", async () => {
    isolateCredentialStore();
    process.env.FIGMA_TOKEN = "some-pat";
    connectAttempts = 0;
    try {
      const result = await client.callTool({ name: "get_figma_design", arguments: { fileKey: "abc", nodeId: "1:2" } });
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
      expect(text).toContain("Figma API error");
      expect(connectAttempts).toBe(0);
    } finally {
      delete process.env.FIGMA_TOKEN;
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

  it("render_design renders a DesignNode tree to HTML+CSS source, not JSON", async () => {
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
    const result = await client.callTool({ name: "render_design", arguments: { nodes, format: "html-css" } });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("<!DOCTYPE html>");
    expect(content[0]!.text).toContain("node-1");
  });
});
