import { classifyTree } from "@weavensign/normalization";
import { DesignNodeSchema } from "@weavensign/schema";
import { z } from "zod";
import { jsonToolResult, type ToolResult } from "./tool-result.js";

export const CLASSIFY_ROLES_INPUT_SHAPE = {
  nodes: z.array(DesignNodeSchema).describe("Top-level DesignNode array, as returned by get_figma_design/get_penpot_page"),
};

const ClassifyRolesInputSchema = z.object(CLASSIFY_ROLES_INPUT_SHAPE);
export type ClassifyRolesInput = z.infer<typeof ClassifyRolesInputSchema>;

/**
 * Runs the normalization heuristics against a DesignNode tree, returning a role
 * assignment (button, card, icon, ...) per node. Heuristic-based, not ground truth —
 * see /normalization's README for current per-role precision/recall against the eval set.
 */
export async function classifyRoles(input: ClassifyRolesInput): Promise<ToolResult> {
  const assignments = classifyTree(input.nodes);
  return jsonToolResult(assignments);
}
