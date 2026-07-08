import type { DesignNode } from "@weavensign/schema";
import type { RoleAssignment } from "../role-label.js";
import { classifyContainer } from "./classify-container.js";
import { classifyText } from "./classify-text.js";
import { classifyVector } from "./classify-vector.js";

function assertNever(value: never): never {
  throw new Error(`Unhandled DesignNode type: ${JSON.stringify(value)}`);
}

/** Classifies one node in context of its siblings, without recursing into children. */
function classifyOne(node: DesignNode, siblings: DesignNode[]): RoleAssignment {
  switch (node.type) {
    case "text": {
      const { role, confidence } = classifyText(node);
      return { nodeId: node.id, role, confidence };
    }
    case "vector": {
      const vectorSiblingCount = siblings.filter((sibling) => sibling.type === "vector").length;
      const { role, confidence } = classifyVector(node, vectorSiblingCount);
      return { nodeId: node.id, role, confidence };
    }
    case "frame":
    case "group":
    case "component":
    case "component-instance": {
      const { role, confidence } = classifyContainer(node, siblings);
      return { nodeId: node.id, role, confidence };
    }
    default:
      return assertNever(node);
  }
}

function childrenOf(node: DesignNode): DesignNode[] {
  switch (node.type) {
    case "frame":
    case "group":
    case "component":
    case "component-instance":
      return node.children;
    case "text":
    case "vector":
      return [];
    default:
      return assertNever(node);
  }
}

/** Classifies every node in one sibling group, then recurses into each node's children. */
function classifySiblingGroup(nodes: DesignNode[], assignments: RoleAssignment[]): void {
  for (const node of nodes) {
    assignments.push(classifyOne(node, nodes));
    classifySiblingGroup(childrenOf(node), assignments);
  }
}

/**
 * Walks a DesignNode tree top-down, classifying every node against its own siblings, and
 * flattens the result into one RoleAssignment[] covering the whole tree. This is the
 * entry point `/eval`'s score.ts calls to produce a heuristic's predictions.
 */
export function classifyTree(roots: DesignNode[]): RoleAssignment[] {
  const assignments: RoleAssignment[] = [];
  classifySiblingGroup(roots, assignments);
  return assignments;
}
