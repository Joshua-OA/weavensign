import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesignNodeSchema, type DesignNode } from "@weavensign/schema";
import { describe, expect, it } from "vitest";
import { renderDocument } from "./render-document.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(MODULE_DIR, "..");

function loadFixture(name: string): DesignNode[] {
  const raw = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "fixtures", `${name}.json`), "utf-8")) as unknown[];
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
});
