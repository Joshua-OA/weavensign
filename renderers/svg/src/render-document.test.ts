import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesignNodeSchema, type DesignNode } from "@weavensign/schema";
import { describe, expect, it } from "vitest";
import { renderDocument } from "./render-document.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(MODULE_DIR, "..");
const SHARED_FIXTURES_DIR = path.join(PACKAGE_ROOT, "..", "shared", "fixtures");

function loadFixture(name: string): DesignNode[] {
  const raw = JSON.parse(readFileSync(path.join(SHARED_FIXTURES_DIR, `${name}.json`), "utf-8")) as unknown[];
  return raw.map((node) => DesignNodeSchema.parse(node));
}

function loadGolden(name: string): string {
  return readFileSync(path.join(PACKAGE_ROOT, "golden", `${name}.svg`), "utf-8");
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

  it("escapes XML-significant characters in text content", () => {
    const nodes = loadFixture("simple-card");
    const svg = renderDocument(nodes);
    expect(svg).toContain("Hello &amp; &lt;world&gt;");
    expect(svg).not.toContain("Hello & <world>");
  });

  it("does not render an invisible node's children", () => {
    const nodes = loadFixture("simple-card");
    const frame = nodes[0]!;
    if ("children" in frame) {
      frame.children = frame.children.map((child) => ({ ...child, visible: false }));
    }
    const svg = renderDocument(nodes);
    expect(svg).not.toContain("Hello");
    expect(svg).not.toContain("M0 0 L24 0");
  });

  it("maps cornerRadius to the rect's rx attribute", () => {
    const nodes = loadFixture("simple-card");
    const svg = renderDocument(nodes);
    expect(svg).toContain('rx="8"');
  });

  it("matches the golden file for a real image-fill node (rendered as a flat placeholder color, not a broken image reference)", () => {
    const nodes = loadFixture("image-fill-placeholder");
    expect(renderDocument(nodes)).toBe(loadGolden("image-fill-placeholder"));
  });

  it("renders an image-only fill as a flat placeholder color, with no reference to the unresolvable assetRef", () => {
    const nodes = loadFixture("image-fill-placeholder");
    const svg = renderDocument(nodes);
    expect(svg).not.toContain("25f24886b60bef4d77ebf1a1658997bb75772fb7");
    expect(svg).toContain("#e5e5e5");
  });

  it("matches the golden file for a resolved image fill (real <image> element)", () => {
    const nodes = loadFixture("image-fill-resolved");
    expect(renderDocument(nodes)).toBe(loadGolden("image-fill-resolved"));
  });

  it("renders a resolved image fill as a real <image> element, not the placeholder rect", () => {
    const nodes = loadFixture("image-fill-resolved");
    const svg = renderDocument(nodes);
    expect(svg).toContain('href="https://example.com/resolved-photo.png"');
    expect(svg).not.toContain("#e5e5e5");
    expect(svg).not.toContain("<rect");
  });

  it("maps a resolved 'stretch' scaleMode to preserveAspectRatio='none'", () => {
    const nodes = loadFixture("image-fill-resolved");
    const svg = renderDocument(nodes);
    expect(svg).toContain('preserveAspectRatio="none"');
  });

  it("matches the golden file for a real hug-contents (width-and-height autoResize) text node", () => {
    const nodes = loadFixture("text-hug-contents");
    expect(renderDocument(nodes)).toBe(loadGolden("text-hug-contents"));
  });

  it("produces a well-formed root <svg> element with a viewBox", () => {
    const nodes = loadFixture("simple-card");
    const svg = renderDocument(nodes);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+(\.\d+)?" height="\d+(\.\d+)?" viewBox="0 0 \d+(\.\d+)? \d+(\.\d+)?">/);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });
});
