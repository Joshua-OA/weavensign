/**
 * Manual verification tool: runs the current normalization heuristic against every
 * labeled fixture in /eval/fixtures and prints per-role precision/recall. Not part of
 * build/test — run directly with `npx tsx eval/run-heuristic.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { classifyTree, ROLE_LABELS } from "@weavensign/normalization";
import type { DesignNode } from "@weavensign/schema";
import { precision, recall, scoreAssignments } from "./score.js";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(EVAL_DIR, "fixtures");

function loadFixture(fixtureName: string): DesignNode[] {
  const fixturePath = path.join(FIXTURES_DIR, `${fixtureName}.json`);
  const raw = readFileSync(fixturePath, "utf-8");
  return JSON.parse(raw) as DesignNode[];
}

function fixtureNames(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""));
}

function printReportForFixture(fixtureName: string): void {
  const roots = loadFixture(fixtureName);
  const predicted = classifyTree(roots);
  const report = scoreAssignments(fixtureName, predicted);

  console.log(`\n=== ${fixtureName} ===`);
  for (const role of ROLE_LABELS) {
    const counts = report.perRole[role];
    const p = precision(counts);
    const r = recall(counts);
    const pStr = p === undefined ? "  n/a" : p.toFixed(2);
    const rStr = r === undefined ? "  n/a" : r.toFixed(2);
    console.log(
      `${role.padEnd(12)} precision=${pStr}  recall=${rStr}  (tp=${counts.truePositives} fp=${counts.falsePositives} fn=${counts.falseNegatives})`,
    );
  }
}

function main(): void {
  for (const fixtureName of fixtureNames()) {
    printReportForFixture(fixtureName);
  }
}

main();
