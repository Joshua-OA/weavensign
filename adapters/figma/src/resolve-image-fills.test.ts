import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DesignNode } from "@weavensign/schema";
import { describe, expect, it } from "vitest";
import { resolveImageFills } from "./resolve-image-fills.js";

const fixturesDir = fileURLToPath(new URL("../fixtures/raw/", import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${fixturesDir}${name}.json`, "utf-8"));
}

function makeImageFillNode(assetRef: string): DesignNode {
  return {
    id: "8:10",
    name: "Frame 2",
    visible: true,
    locked: false,
    geometry: { position: { x: 0, y: 100 }, size: { width: 300, height: 150 }, rotationDegrees: 0 },
    type: "frame",
    style: {
      fills: [{ type: "image", assetRef, scaleMode: "stretch" }],
      strokes: [],
      effects: [],
      opacity: 1,
      blendMode: "normal",
    },
    clipsContent: true,
    children: [],
  };
}

describe("resolveImageFills", () => {
  it("substitutes a real URL for an assetRef the images response resolves", () => {
    const response = loadFixture("image-fills-response");
    const node = makeImageFillNode("25f24886b60bef4d77ebf1a1658997bb75772fb7");
    const result = resolveImageFills([node], response);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [resolvedNode] = result.value;
    if (resolvedNode?.type !== "frame") throw new Error("expected frame");
    const [fill] = resolvedNode.style.fills;
    if (fill?.type !== "image") throw new Error("expected image fill");
    expect(fill.assetRef).toBe("https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/example-resolved-asset");
  });

  it("leaves assetRef unchanged when the ref has no entry in the images response", () => {
    const response = loadFixture("image-fills-response");
    const node = makeImageFillNode("some-ref-not-in-the-response");
    const result = resolveImageFills([node], response);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [resolvedNode] = result.value;
    if (resolvedNode?.type !== "frame") throw new Error("expected frame");
    const [fill] = resolvedNode.style.fills;
    if (fill?.type !== "image") throw new Error("expected image fill");
    expect(fill.assetRef).toBe("some-ref-not-in-the-response");
  });

  it("leaves assetRef unchanged when the images response explicitly resolves it to null", () => {
    const response = loadFixture("image-fills-response");
    const node = makeImageFillNode("unresolvable-asset-ref");
    const result = resolveImageFills([node], response);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [resolvedNode] = result.value;
    if (resolvedNode?.type !== "frame") throw new Error("expected frame");
    const [fill] = resolvedNode.style.fills;
    if (fill?.type !== "image") throw new Error("expected image fill");
    expect(fill.assetRef).toBe("unresolvable-asset-ref");
  });

  it("resolves image fills on nested children, not just top-level nodes", () => {
    const child = makeImageFillNode("65c9b2e2178b53eba63dace1c4f1d8c96673ade2");
    const parent: DesignNode = {
      id: "1:1",
      name: "Parent",
      visible: true,
      locked: false,
      geometry: { position: { x: 0, y: 0 }, size: { width: 400, height: 400 }, rotationDegrees: 0 },
      type: "group",
      children: [child],
    };
    const response = loadFixture("image-fills-response");
    const result = resolveImageFills([parent], response);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [resolvedParent] = result.value;
    if (resolvedParent?.type !== "group") throw new Error("expected group");
    const [resolvedChild] = resolvedParent.children;
    if (resolvedChild?.type !== "frame") throw new Error("expected frame");
    const [fill] = resolvedChild.style.fills;
    if (fill?.type !== "image") throw new Error("expected image fill");
    expect(fill.assetRef).toBe("https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/example-resolved-asset-2");
  });

  it("does not touch solid fills", () => {
    const node: DesignNode = {
      id: "1",
      name: "Solid",
      visible: true,
      locked: false,
      geometry: { position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, rotationDegrees: 0 },
      type: "vector",
      style: {
        fills: [{ type: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }],
        strokes: [],
        effects: [],
        opacity: 1,
        blendMode: "normal",
      },
      paths: [{ data: "M0 0", windingRule: "nonzero" }],
    };
    const response = loadFixture("image-fills-response");
    const result = resolveImageFills([node], response);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [resolvedNode] = result.value;
    if (resolvedNode?.type !== "vector") throw new Error("expected vector");
    expect(resolvedNode.style.fills).toEqual(node.style.fills);
  });

  it("returns an invalid-response error for a malformed images response", () => {
    const node = makeImageFillNode("anything");
    const result = resolveImageFills([node], { not: "the right shape" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid-response");
  });
});
