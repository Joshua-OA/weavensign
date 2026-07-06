import { describe, expect, it } from "vitest";
import { emptyRoleCounts, precision, recall, scoreAssignments } from "./score.js";

describe("scoreAssignments", () => {
  it("counts a correct prediction as a true positive for that role", () => {
    const report = scoreAssignments("scoring-smoke-test", [
      { nodeId: "1", role: "button", confidence: 1 },
      { nodeId: "2", role: "icon", confidence: 1 },
      { nodeId: "3", role: "other", confidence: 1 },
    ]);
    expect(report.perRole.button.truePositives).toBe(1);
    expect(report.perRole.icon.truePositives).toBe(1);
    expect(report.perRole.other.truePositives).toBe(1);
  });

  it("counts a wrong prediction as a false negative for the true role and a false positive for the predicted role", () => {
    const report = scoreAssignments("scoring-smoke-test", [
      { nodeId: "1", role: "card", confidence: 1 },
      { nodeId: "2", role: "icon", confidence: 1 },
      { nodeId: "3", role: "other", confidence: 1 },
    ]);
    expect(report.perRole.button.falseNegatives).toBe(1);
    expect(report.perRole.card.falsePositives).toBe(1);
  });

  it("counts a missing prediction as a false negative without a matching false positive", () => {
    const report = scoreAssignments("scoring-smoke-test", [
      { nodeId: "2", role: "icon", confidence: 1 },
      { nodeId: "3", role: "other", confidence: 1 },
    ]);
    expect(report.perRole.button.falseNegatives).toBe(1);
    const totalFalsePositives = Object.values(report.perRole).reduce(
      (sum, counts) => sum + counts.falsePositives,
      0,
    );
    expect(totalFalsePositives).toBe(0);
  });
});

describe("precision and recall", () => {
  it("is undefined when the denominator is zero, not 0", () => {
    const counts = emptyRoleCounts().other;
    expect(precision(counts)).toBeUndefined();
    expect(recall(counts)).toBeUndefined();
  });

  it("computes precision and recall from counts", () => {
    const counts = { truePositives: 3, falsePositives: 1, falseNegatives: 2 };
    expect(precision(counts)).toBeCloseTo(0.75);
    expect(recall(counts)).toBeCloseTo(0.6);
  });
});
