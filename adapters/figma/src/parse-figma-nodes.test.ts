import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFigmaNodes } from "./parse-figma-nodes.js";

const fixturesDir = fileURLToPath(new URL("../fixtures/raw/", import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${fixturesDir}${name}.json`, "utf-8"));
}

/** Wraps a bare recorded `document` fixture into the envelope shape `GET /v1/files/:key/nodes` actually returns. */
function toNodesResponse(nodeId: string, document: unknown, components: unknown = {}) {
  return { nodes: { [nodeId]: { document, components } } };
}

describe("parseFigmaNodes", () => {
  it("maps a frame with ellipse, vector, and text children", () => {
    const document = loadFixture("frame-with-shapes-and-text");
    const result = parseFigmaNodes(toNodesResponse("1:100", document), "file-1", ["1:100"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [frame] = result.value;
    expect(frame?.type).toBe("frame");
    if (frame?.type !== "frame") return;
    expect(frame.children).toHaveLength(3);
    expect(frame.children.map((child) => child.type)).toEqual(["vector", "vector", "text"]);
    expect(frame.geometry.position).toEqual({ x: 24, y: 712 });

    const [ellipse, vector, text] = frame.children;
    expect(ellipse?.type === "vector" && ellipse.paths[0]?.data.startsWith("M54 27")).toBe(true);
    expect(vector?.type === "vector" && vector.style.fills[0]).toMatchObject({ type: "solid" });
    expect(text?.type === "text" && text.content.runs[0]?.characters).toBe("Get started");

    expect(frame.style.fills[0]).toMatchObject({ type: "gradient", gradientKind: "linear" });
  });

  it("maps a group with a nested frame, no style fields required", () => {
    const document = loadFixture("group-with-nested-frames");
    const result = parseFigmaNodes(toNodesResponse("1:300", document), "file-1", ["1:300"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [group] = result.value;
    expect(group?.type).toBe("group");
    if (group?.type !== "group") return;
    expect(group.children).toHaveLength(1);
    expect(group.children[0]?.type).toBe("frame");
  });

  it("maps a component definition, resolving its stable key from the components map", () => {
    const document = loadFixture("component-definition");
    const components = loadFixture("component-definition.components");
    const result = parseFigmaNodes(toNodesResponse("1:50", document, components), "file-1", ["1:50"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [component] = result.value;
    expect(component?.type).toBe("component");
    if (component?.type !== "component") return;
    expect(component.key).toBe("a1b2c3d4-button-primary-dark-off");
  });

  it("maps a component instance, resolving componentId through the components map to the definition's key", () => {
    const document = loadFixture("component-instance");
    const components = loadFixture("component-instance.components");
    const result = parseFigmaNodes(toNodesResponse("1:200", document, components), "file-1", ["1:200"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [instance] = result.value;
    expect(instance?.type).toBe("component-instance");
    if (instance?.type !== "component-instance") return;
    expect(instance.componentKey).toBe("a1b2c3d4-button-primary-dark-off");
    expect(instance.overrides).toHaveProperty("Label#0:0");
    expect(instance.children).toHaveLength(1);
  });

  it("returns an error, not a throw, when an instance's componentId has no matching components-map entry", () => {
    const document = loadFixture("component-instance");
    const result = parseFigmaNodes(toNodesResponse("1:200", document, {}), "file-1", ["1:200"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unresolved-component-reference");
  });

  it("returns an error for a requested node id absent from the response", () => {
    const document = loadFixture("frame-with-shapes-and-text");
    const result = parseFigmaNodes(toNodesResponse("1:100", document), "file-1", ["9:999"]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("node-not-found");
  });

  it("returns an error, not a throw, for a malformed response body", () => {
    const result = parseFigmaNodes({ nodes: "not-an-object" }, "file-1", ["1:100"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid-response");
  });
});
