/**
 * Merges a reviewed labels JSON (exported from a eval/generate-review.ts page) back into
 * eval/labels/<fixture>.json — an explicit, reviewed update, never a silent overwrite
 * (context.md §4.8 applies to this eval set the same way it applies to renderer golden
 * files: a human decided the new values, they didn't get regenerated unattended).
 *
 * Not part of build/test — run directly with
 * `npx tsx eval/apply-review.ts <fixture> <path-to-exported-json>`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RoleAssignment } from "@weavensign/normalization";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));

function main(): void {
  const fixtureName = process.argv[2];
  const reviewedPath = process.argv[3];
  if (!fixtureName || !reviewedPath) {
    console.error("Usage: npx tsx eval/apply-review.ts <fixture-name> <path-to-exported-json>");
    process.exit(1);
  }

  const labelsPath = path.join(EVAL_DIR, "labels", `${fixtureName}.json`);
  const existing = JSON.parse(readFileSync(labelsPath, "utf-8")) as RoleAssignment[];
  const reviewed = JSON.parse(readFileSync(reviewedPath, "utf-8")) as RoleAssignment[];

  const merged = new Map(existing.map((label) => [label.nodeId, label.role]));
  let changed = 0;
  for (const { nodeId, role } of reviewed) {
    if (merged.get(nodeId) !== role) {
      changed += 1;
    }
    merged.set(nodeId, role);
  }

  const out: RoleAssignment[] = [...merged.entries()].map(([nodeId, role]) => ({ nodeId, role }));
  out.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  writeFileSync(labelsPath, `${JSON.stringify(out, null, 2)}\n`, "utf-8");
  console.log(`${labelsPath}: ${changed} label(s) changed, ${out.length} total.`);
}

main();
