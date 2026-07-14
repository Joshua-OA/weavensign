import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesignNodeSchema, type DesignNode } from "@weavensign/schema";
import { describe, expect, it } from "vitest";
import { renderDocument } from "./render-document.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(MODULE_DIR, "..");
// Fixtures live in the sibling renderer-shared package (renderers/shared/fixtures), not
// here — both html-css and jsx-tsx test against the exact same DesignNode[] inputs, see
// that package's README for why this is a single shared source rather than two copies.
const SHARED_FIXTURES_DIR = path.join(PACKAGE_ROOT, "..", "shared", "fixtures");

function loadFixture(name: string): DesignNode[] {
  const raw = JSON.parse(readFileSync(path.join(SHARED_FIXTURES_DIR, `${name}.json`), "utf-8")) as unknown[];
  return raw.map((node) => DesignNodeSchema.parse(node));
}

function loadGolden(name: string): string {
  return readFileSync(path.join(PACKAGE_ROOT, "golden", `${name}.html`), "utf-8");
}

describe("renderDocument", () => {
  it("matches the golden file for the simple-card fixture", () => {
    const nodes = loadFixture("simple-card");
    expect(renderDocument(nodes)).toBe(loadGolden("simple-card"));
  });

  it("is deterministic: rendering the same tree twice produces byte-identical output (context.md §4.7)", () => {
    const nodes = loadFixture("simple-card");
    const first = renderDocument(nodes);
    const second = renderDocument(nodes);
    expect(first).toBe(second);
  });

  it("escapes HTML-significant characters in text content", () => {
    const nodes = loadFixture("simple-card");
    const html = renderDocument(nodes);
    expect(html).toContain("Hello &amp; &lt;world&gt;");
    expect(html).not.toContain("Hello & <world>");
  });

  it("does not render an invisible node's children", () => {
    const nodes = loadFixture("simple-card");
    const frame = nodes[0]!;
    if ("children" in frame) {
      frame.children = frame.children.map((child) => ({ ...child, visible: false }));
    }
    const html = renderDocument(nodes);
    expect(html).not.toContain("node-text-1");
    expect(html).not.toContain("node-vector-1");
  });

  it("keeps a container's own position: absolute intact rather than overriding it with position: relative", () => {
    const nodes = loadFixture("simple-card");
    const html = renderDocument(nodes);
    const frameRuleMatch = html.match(/#node-frame-1 \{[^}]*\}/);
    expect(frameRuleMatch).not.toBeNull();
    const frameRule = frameRuleMatch![0];
    expect(frameRule).toContain("position: absolute");
    expect(frameRule).not.toContain("position: relative");
  });

  it("matches the golden file for a real image-fill node (rendered as a placeholder, not a broken <img>)", () => {
    const nodes = loadFixture("image-fill-placeholder");
    expect(renderDocument(nodes)).toBe(loadGolden("image-fill-placeholder"));
  });

  it("renders an image-only fill as a striped placeholder, not an <img> tag pointing at an unresolvable assetRef", () => {
    const nodes = loadFixture("image-fill-placeholder");
    const html = renderDocument(nodes);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("25f24886b60bef4d77ebf1a1658997bb75772fb7");
    expect(html).toContain("repeating-linear-gradient");
  });

  it("matches the golden file for a real hug-contents (width-and-height autoResize) text node", () => {
    const nodes = loadFixture("text-hug-contents");
    expect(renderDocument(nodes)).toBe(loadGolden("text-hug-contents"));
  });

  it("renders width-and-height autoResize text with width/height: auto instead of the source geometry's fixed pixels", () => {
    const nodes = loadFixture("text-hug-contents");
    const html = renderDocument(nodes);
    const ruleMatch = html.match(/#node-28-86 \{[^}]*\}/);
    expect(ruleMatch).not.toBeNull();
    const rule = ruleMatch![0];
    expect(rule).toContain("width: auto");
    expect(rule).toContain("height: auto");
    expect(rule).not.toContain("width: 46px");
  });
});
