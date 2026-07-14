/**
 * Manual verification tool: runs renderDocument against every real fixture in /eval/fixtures
 * (not this package's own small golden fixtures) and reports whether it crashes, how long it
 * takes, and whether the output is structurally well-formed. Not a golden-file test — these
 * fixtures are too large to review byte-for-byte; this is the same "does it survive contact
 * with real, previously-unexercised data" check learning_v0.md's adapter sessions ran before
 * calling an adapter done. Not part of build/test — run directly with
 * `npx tsx renderers/html-css/scripts/smoke-render.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DesignNodeSchema, type DesignNode } from "@weavensign/schema";
import { renderDocument } from "../src/render-document.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVAL_FIXTURES_DIR = path.join(SCRIPT_DIR, "..", "..", "..", "eval", "fixtures");

interface TagBalanceCheck {
  tag: string;
  opens: number;
  closes: number;
}

const SELF_CLOSING_OR_VOID_TAGS = new Set(["meta", "path"]);
const CHECKED_TAGS = ["div", "span", "svg", "path", "style", "head", "body", "html"];

function loadEvalFixture(fixtureName: string): DesignNode[] {
  const raw = readFileSync(path.join(EVAL_FIXTURES_DIR, fixtureName), "utf-8");
  const parsed = JSON.parse(raw) as unknown[];
  return parsed.map((node) => DesignNodeSchema.parse(node));
}

function checkTagBalance(html: string, tag: string): TagBalanceCheck {
  const opens = (html.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
  const selfClosing = SELF_CLOSING_OR_VOID_TAGS.has(tag) ? (html.match(new RegExp(`<${tag}[^>]*/>`, "g")) ?? []).length : 0;
  const closes = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length + selfClosing;
  return { tag, opens, closes };
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
  const html = renderDocument(roots);
  const elapsedMs = performance.now() - start;

  console.log(`nodes: ${nodeCount}  output bytes: ${html.length}  render time: ${elapsedMs.toFixed(1)}ms`);

  let allBalanced = true;
  for (const tag of CHECKED_TAGS) {
    const check = checkTagBalance(html, tag);
    if (check.opens !== check.closes) {
      allBalanced = false;
      console.log(`  UNBALANCED <${tag}>: ${check.opens} opens vs ${check.closes} closes`);
    }
  }
  console.log(allBalanced ? "  tags: balanced" : "  tags: MISMATCH (see above)");

  if (html.includes("undefined") || html.includes("NaN")) {
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
