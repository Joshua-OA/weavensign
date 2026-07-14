/**
 * Manual verification tool: runs renderDocument against every real fixture in
 * /eval/fixtures and reports whether it crashes, how long it takes, and whether the
 * output is a well-formed <svg> document. Mirrors renderer-html-css/renderer-jsx-tsx's
 * smoke tests. Not part of build/test — run directly with
 * `npx tsx renderers/svg/scripts/smoke-render.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DesignNodeSchema, type DesignNode } from "@weavensign/schema";
import { renderDocument } from "../src/render-document.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVAL_FIXTURES_DIR = path.join(SCRIPT_DIR, "..", "..", "..", "eval", "fixtures");

function loadEvalFixture(fixtureName: string): DesignNode[] {
  const raw = readFileSync(path.join(EVAL_FIXTURES_DIR, fixtureName), "utf-8");
  const parsed = JSON.parse(raw) as unknown[];
  return parsed.map((node) => DesignNodeSchema.parse(node));
}

function reportForFixture(fixtureName: string): void {
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
  const svg = renderDocument(roots);
  const elapsedMs = performance.now() - start;

  console.log(`nodes: ${nodeCount}  output bytes: ${svg.length}  render time: ${elapsedMs.toFixed(1)}ms`);

  const wellFormed = svg.startsWith("<svg") && svg.trim().endsWith("</svg>");
  console.log(wellFormed ? "  root element: well-formed <svg>" : "  WARNING: output is not a well-formed <svg> root element");

  if (svg.includes("undefined") || svg.includes("NaN")) {
    console.log("  WARNING: output contains literal 'undefined' or 'NaN'");
  }
}

function main(): void {
  const fixtureNames = readdirSync(EVAL_FIXTURES_DIR).filter((file) => file.endsWith(".json"));
  for (const fixtureName of fixtureNames) {
    reportForFixture(fixtureName);
  }
}

main();
