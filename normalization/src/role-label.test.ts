import { describe, expect, it } from "vitest";
import { ROLE_LABELS } from "./role-label.js";

describe("ROLE_LABELS", () => {
  it("has no duplicate entries", () => {
    expect(new Set(ROLE_LABELS).size).toBe(ROLE_LABELS.length);
  });

  it("includes the always-valid fallback role", () => {
    expect(ROLE_LABELS).toContain("other");
  });
});
