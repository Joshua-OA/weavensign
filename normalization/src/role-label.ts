/** Semantic role categories the normalization layer can assign to a DesignNode. */
export const ROLE_LABELS = [
  "button",
  "card",
  "icon",
  "nav-item",
  "input-field",
  "heading",
  "body-text",
  "image",
  "avatar",
  "badge",
  "other",
] as const;

export type RoleLabel = (typeof ROLE_LABELS)[number];

/** A role assignment for one DesignNode, identified by its schema-level node id. */
export interface RoleAssignment {
  nodeId: string;
  role: RoleLabel;
  /** 0–1 confidence; heuristics that are certain should still report a value, not omit it. */
  confidence: number;
}
