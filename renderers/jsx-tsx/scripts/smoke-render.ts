/**
 * Manual verification tool: runs renderComponent against every real fixture in
 * /eval/fixtures and reports whether it crashes, how long it takes, and whether the
 * output is syntactically valid (Prettier's own re-parse is the validity check — see
 * render-component.ts's doc comment). Mirrors renderer-html-css's
 * scripts/smoke-render.ts. Not part of build/test — run directly with
 * `npx tsx renderers/jsx-tsx/scripts/smoke-render.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DesignNodeSchema, type DesignNode } from "@weavensign/schema";
import { renderComponent } from "../src/render-component.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVAL_FIXTURES_DIR = path.join(SCRIPT_DIR, "..", "..", "..", "eval", "fixtures");

function loadEvalFixture(fixtureName: string): DesignNode[] {
  const raw = readFileSync(path.join(EVAL_FIXTURES_DIR, fixtureName), "utf-8");
  const parsed = JSON.parse(raw) as unknown[];
  return parsed.map((node) => DesignNodeSchema.parse(node));
}

async function reportForFixture(fixtureName: string): Promise<void> {
  console.log(`\n=== ${fixtureName} ===`);

  const roots = loadEvalFixture(fixtureName);
  let nodeCount = 0;
  function countNodes(node: DesignNode): void {
    nodeCount++;
    if ("children" in node) {
      for (const child of node.children) countNodes(child);
    }
  }
  for (const root of roots) countNodes(root);

  const start = performance.now();
  const code = await renderComponent(roots);
  const elapsedMs = performance.now() - start;

  console.log(`nodes: ${nodeCount}  output bytes: ${code.length}  render time: ${elapsedMs.toFixed(1)}ms`);

  if (code.includes("undefined") || code.includes("NaN")) {
    console.log("  WARNING: output contains literal 'undefined' or 'NaN'");
  }
}

async function main(): Promise<void> {
  const fixtureNames = readdirSync(EVAL_FIXTURES_DIR).filter((file) => file.endsWith(".json"));
  for (const fixtureName of fixtureNames) {
    await reportForFixture(fixtureName);
  }
}

main();
