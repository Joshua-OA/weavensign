import type { DesignNode } from "@weavensign/schema";
import type { RoleLabel } from "../role-label.js";

const CARD_MIN_SIDE_PX = 100;
const CARD_MAX_ASPECT_RATIO = 4;
const REPEATED_SIBLING_THRESHOLD = 2;

/** Counts how many siblings (including this node) share the same name — a strong signal for a repeated component like a product/content card. */
function countSiblingsWithSameName(node: DesignNode, siblings: DesignNode[]): number {
  return siblings.filter((sibling) => sibling.name === node.name).length;
}

/**
 * Classifies a container node (frame/group/component/component-instance) using two
 * signals: repetition among siblings (many same-named siblings strongly suggests a
 * repeated card pattern) and rough card-like proportions (roomy, not a thin strip).
 * Containers matching neither signal fall through to "other" rather than a guess —
 * a container's role is the least visually self-evident of any node kind here.
 */
export function classifyContainer(
  node: DesignNode,
  siblings: DesignNode[],
): { role: RoleLabel; confidence: number } {
  const { width, height } = node.geometry.size;
  const longestSide = Math.max(width, height);
  const shortestSide = Math.max(Math.min(width, height), 1);
  const aspectRatio = longestSide / shortestSide;

  const repeatCount = countSiblingsWithSameName(node, siblings);
  const looksCardShaped = shortestSide >= CARD_MIN_SIDE_PX && aspectRatio <= CARD_MAX_ASPECT_RATIO;

  if (repeatCount >= REPEATED_SIBLING_THRESHOLD && looksCardShaped) {
    return { role: "card", confidence: 0.65 };
  }
  if (looksCardShaped && "children" in node && node.children.length >= 3) {
    return { role: "card", confidence: 0.4 };
  }
  return { role: "other", confidence: 0.3 };
}
