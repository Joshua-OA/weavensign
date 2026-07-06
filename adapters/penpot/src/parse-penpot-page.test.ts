import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePenpotPage } from "./parse-penpot-page.js";

const fixturesDir = fileURLToPath(new URL("../fixtures/raw/", import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${fixturesDir}${name}.json`, "utf-8"));
}

describe("parsePenpotPage", () => {
  it("reconstructs the tree from the flat objects map, deriving parent-relative position", () => {
    const page = loadFixture("page-with-shapes") as { objects: unknown };
    const components = loadFixture("page-with-shapes.components");
    const result = parsePenpotPage(page.objects, components, "file-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [card, instance] = result.value;
    expect(card?.type).toBe("frame");
    if (card?.type !== "frame") return;

    // frame-1 is at absolute (100,100), its parent (root frame) is at (0,0):
    // local position should equal the absolute position here.
    expect(card.geometry.position).toEqual({ x: 100, y: 100 });
    expect(card.children.map((c) => c.type)).toEqual(["vector", "vector", "vector", "text", "group"]);

    const [rect] = card.children;
    expect(rect?.type === "vector" && rect.geometry.position).toEqual({ x: 0, y: 0 });

    expect(instance?.type).toBe("component-instance");
  });

  it("synthesizes rect and circle outlines as vector paths", () => {
    const page = loadFixture("page-with-shapes") as { objects: unknown };
    const components = loadFixture("page-with-shapes.components");
    const result = parsePenpotPage(page.objects, components, "file-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [card] = result.value;
    if (card?.type !== "frame") return;
    const [rect, circle] = card.children;
    expect(rect?.type === "vector" && rect.paths[0]?.data.length).toBeGreaterThan(0);
    expect(circle?.type === "vector" && circle.paths[0]?.data.startsWith("M24")).toBe(true);
  });

  it("maps a path shape's content string directly to a vector path", () => {
    const page = loadFixture("page-with-shapes") as { objects: unknown };
    const components = loadFixture("page-with-shapes.components");
    const result = parsePenpotPage(page.objects, components, "file-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [card] = result.value;
    if (card?.type !== "frame") return;
    const path = card.children[2];
    expect(path?.type === "vector" && path.paths[0]?.data.startsWith("M285.0")).toBe(true);
  });

  it("maps text content by flattening the paragraph tree into runs, parsing hex fill color", () => {
    const page = loadFixture("page-with-shapes") as { objects: unknown };
    const components = loadFixture("page-with-shapes.components");
    const result = parsePenpotPage(page.objects, components, "file-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [card] = result.value;
    if (card?.type !== "frame") return;
    const text = card.children[3];
    expect(text?.type === "text" && text.content.runs[0]?.characters).toBe("website_presentation.doc");
    expect(text?.type === "text" && text.content.runs[0]?.style.color).toEqual({
      r: 201 / 255,
      g: 207 / 255,
      b: 217 / 255,
      a: 1,
    });
  });

  it("resolves a group's nested child with position relative to the group, not the frame", () => {
    const page = loadFixture("page-with-shapes") as { objects: unknown };
    const components = loadFixture("page-with-shapes.components");
    const result = parsePenpotPage(page.objects, components, "file-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [card] = result.value;
    if (card?.type !== "frame") return;
    const group = card.children[4];
    expect(group?.type).toBe("group");
    if (group?.type !== "group") return;
    // group-1 absolute (200,150), group-child-1 absolute (200,150) -> local (0,0)
    expect(group.children[0]?.geometry.position).toEqual({ x: 0, y: 0 });
  });

  it("maps a component-instance frame, resolving componentKey from the components map", () => {
    const page = loadFixture("page-with-shapes") as { objects: unknown };
    const components = loadFixture("page-with-shapes.components");
    const result = parsePenpotPage(page.objects, components, "file-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const instance = result.value[1];
    expect(instance?.type).toBe("component-instance");
    if (instance?.type !== "component-instance") return;
    expect(instance.componentKey).toBe("component-def-1");
  });

  it("returns an error, not a throw, when componentId has no matching components-map entry", () => {
    const page = loadFixture("page-with-shapes") as { objects: unknown };
    const result = parsePenpotPage(page.objects, {}, "file-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unresolved-component-reference");
  });

  it("returns an error, not a throw, for a malformed objects map", () => {
    const result = parsePenpotPage("not-an-object", {}, "file-1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid-objects");
  });
});
