import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RoleAssignment, RoleLabel } from "@weavensign/normalization";
import { ROLE_LABELS } from "@weavensign/normalization";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));

export interface RoleCounts {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface ScoreReport {
  fixtureName: string;
  perRole: Record<RoleLabel, RoleCounts>;
}

/** Loads the hand-labeled roles for a fixture from /eval/labels/<name>.json. */
export function loadLabels(fixtureName: string): RoleAssignment[] {
  const labelsPath = path.join(EVAL_DIR, "labels", `${fixtureName}.json`);
  const raw = readFileSync(labelsPath, "utf-8");
  return JSON.parse(raw) as RoleAssignment[];
}

/** Builds an empty per-role counter table covering every known RoleLabel. */
export function emptyRoleCounts(): Record<RoleLabel, RoleCounts> {
  const counts = {} as Record<RoleLabel, RoleCounts>;
  for (const role of ROLE_LABELS) {
    counts[role] = { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
  }
  return counts;
}

/**
 * Scores a normalization heuristic's predicted assignments against the hand-labeled
 * ground truth for one fixture, per role category (context.md §4.8 — never just an
 * aggregate pass rate).
 */
export function scoreAssignments(
  fixtureName: string,
  predicted: RoleAssignment[],
): ScoreReport {
  const groundTruth = loadLabels(fixtureName);
  const groundTruthByNode = new Map(groundTruth.map((label) => [label.nodeId, label.role]));
  const predictedByNode = new Map(predicted.map((label) => [label.nodeId, label.role]));
  const perRole = emptyRoleCounts();

  for (const [nodeId, actualRole] of groundTruthByNode) {
    const predictedRole = predictedByNode.get(nodeId);
    if (predictedRole === actualRole) {
      perRole[actualRole].truePositives += 1;
    } else {
      perRole[actualRole].falseNegatives += 1;
      if (predictedRole !== undefined) {
        perRole[predictedRole].falsePositives += 1;
      }
    }
  }

  return { fixtureName, perRole };
}

/** Precision = TP / (TP + FP); undefined (not 0) when the role was never predicted. */
export function precision(counts: RoleCounts): number | undefined {
  const denominator = counts.truePositives + counts.falsePositives;
  return denominator === 0 ? undefined : counts.truePositives / denominator;
}

/** Recall = TP / (TP + FN); undefined (not 0) when the role never appears in ground truth. */
export function recall(counts: RoleCounts): number | undefined {
  const denominator = counts.truePositives + counts.falseNegatives;
  return denominator === 0 ? undefined : counts.truePositives / denominator;
}
