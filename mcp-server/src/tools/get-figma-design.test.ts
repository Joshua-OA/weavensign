import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFigmaDesign } from "./get-figma-design.js";

const NODE_ID = "8:10";
const FILE_KEY = "test-file";

function nodesResponseWithImageFill() {
  return {
    nodes: {
      [NODE_ID]: {
        document: {
          id: NODE_ID,
          name: "Frame 2",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 100, width: 300, height: 150 },
          fills: [{ type: "IMAGE", imageRef: "25f24886b60bef4d77ebf1a1658997bb75772fb7", scaleMode: "STRETCH" }],
          strokes: [],
          clipsContent: true,
          children: [],
        },
        components: {},
      },
    },
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe("getFigmaDesign", () => {
  let previousToken: string | undefined;

  beforeEach(() => {
    previousToken = process.env.FIGMA_TOKEN;
    process.env.FIGMA_TOKEN = "test-token";
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.FIGMA_TOKEN;
    else process.env.FIGMA_TOKEN = previousToken;
    vi.unstubAllGlobals();
  });

  it("resolves an image fill's assetRef to a real URL when the tree has one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(nodesResponseWithImageFill()))
      .mockResolvedValueOnce(
        jsonResponse({
          error: false,
          status: 200,
          meta: { images: { "25f24886b60bef4d77ebf1a1658997bb75772fb7": "https://example.com/resolved.png" } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFigmaDesign({ fileKey: FILE_KEY, nodeId: NODE_ID });
    expect(result.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("https://example.com/resolved.png");
    expect(content[0]!.text).not.toContain("25f24886b60bef4d77ebf1a1658997bb75772fb7");
  });

  it("does not call the images endpoint at all when the tree has no image fills", async () => {
    const nodesResponse = nodesResponseWithImageFill();
    nodesResponse.nodes[NODE_ID]!.document.fills = [];
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(nodesResponse));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFigmaDesign({ fileKey: FILE_KEY, nodeId: NODE_ID });
    expect(result.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still returns the parsed nodes, unresolved, when the images endpoint call fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(nodesResponseWithImageFill()))
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, false));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getFigmaDesign({ fileKey: FILE_KEY, nodeId: NODE_ID });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("25f24886b60bef4d77ebf1a1658997bb75772fb7");
  });
});
