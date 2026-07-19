import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesignNodeSchema, type DesignNode } from "@weavensign/schema";
import { describe, expect, it } from "vitest";
import { renderComponent } from "./render-component.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(MODULE_DIR, "..");
const SHARED_FIXTURES_DIR = path.join(PACKAGE_ROOT, "..", "shared", "fixtures");

function loadFixture(name: string): DesignNode[] {
  const raw = JSON.parse(readFileSync(path.join(SHARED_FIXTURES_DIR, `${name}.json`), "utf-8")) as unknown[];
  return raw.map((node) => DesignNodeSchema.parse(node));
}

function loadGolden(name: string): string {
  return readFileSync(path.join(PACKAGE_ROOT, "golden", `${name}.tsx`), "utf-8");
}

describe("renderComponent", () => {
  it("matches the golden file for the simple-card fixture", async () => {
    const nodes = loadFixture("simple-card");
    expect(await renderComponent(nodes)).toBe(loadGolden("simple-card"));
  });

  it("is deterministic: rendering the same tree twice produces byte-identical output (context.md §4.7)", async () => {
    const nodes = loadFixture("simple-card");
    const first = await renderComponent(nodes);
    const second = await renderComponent(nodes);
    expect(first).toBe(second);
  });

  it("wraps text content in a string-literal expression container, not raw JSX text, so special characters don't break parsing", async () => {
    const nodes = loadFixture("simple-card");
    const code = await renderComponent(nodes);
    expect(code).toContain('{"Hello & <world>"}');
  });

  it("does not render an invisible node's children", async () => {
    const nodes = loadFixture("simple-card");
    const frame = nodes[0]!;
    if ("children" in frame) {
      frame.children = frame.children.map((child) => ({ ...child, visible: false }));
    }
    const code = await renderComponent(nodes);
    expect(code).not.toContain("text-1");
    expect(code).not.toContain("vector-1");
  });

  it("keeps a container's own position: absolute (never adds a conflicting position: relative)", async () => {
    const nodes = loadFixture("simple-card");
    const code = await renderComponent(nodes);
    expect(code).toContain('position: "absolute"');
    expect(code).not.toContain('position: "relative"');
  });

  it("matches the golden file for a real image-fill node (rendered as a placeholder, not a broken <img>)", async () => {
    const nodes = loadFixture("image-fill-placeholder");
    expect(await renderComponent(nodes)).toBe(loadGolden("image-fill-placeholder"));
  });

  it("renders an image-only fill as a striped placeholder, not an <img> tag pointing at an unresolvable assetRef", async () => {
    const nodes = loadFixture("image-fill-placeholder");
    const code = await renderComponent(nodes);
    expect(code).not.toContain("<img");
    expect(code).not.toContain("25f24886b60bef4d77ebf1a1658997bb75772fb7");
    expect(code).toContain("repeating-linear-gradient");
  });

  it("matches the golden file for a resolved image fill (real background-image url)", async () => {
    const nodes = loadFixture("image-fill-resolved");
    expect(await renderComponent(nodes)).toBe(loadGolden("image-fill-resolved"));
  });

  it("renders a resolved image fill's CSS properties with camelCase keys, not kebab-case", async () => {
    const nodes = loadFixture("image-fill-resolved");
    const code = await renderComponent(nodes);
    expect(code).toContain('backgroundImage: \'url("https://example.com/resolved-photo.png")\'');
    expect(code).toContain('backgroundSize: "100% 100%"');
    expect(code).not.toContain("background-size");
    expect(code).not.toContain("background-image");
  });

  it("matches the golden file for a real hug-contents (width-and-height autoResize) text node", async () => {
    const nodes = loadFixture("text-hug-contents");
    expect(await renderComponent(nodes)).toBe(loadGolden("text-hug-contents"));
  });

  it("renders width-and-height autoResize text with width/height: auto instead of the source geometry's fixed pixels", async () => {
    const nodes = loadFixture("text-hug-contents");
    const code = await renderComponent(nodes);
    expect(code).toContain('width: "auto"');
    expect(code).toContain('height: "auto"');
    expect(code).not.toContain('width: "46px"');
  });
});
