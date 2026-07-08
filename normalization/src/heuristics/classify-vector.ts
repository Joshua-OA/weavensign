import type { VectorNode } from "@weavensign/schema";
import type { RoleLabel } from "../role-label.js";

const BADGE_MAX_DIMENSION_PX = 16;
const ICON_MAX_DIMENSION_PX = 48;
const ICON_MAX_ASPECT_RATIO = 2;
const FRAGMENT_SIBLING_COUNT_THRESHOLD = 8;
const BADGE_CLUSTER_MIN_SIBLINGS = 2;
const BADGE_CLUSTER_MAX_SIBLINGS = 7;

/**
 * Classifies a vector leaf node using size, aspect ratio, and how many same-parent vector
 * siblings it has. Pixel size alone can't separate a tiny standalone icon (e.g. a 10x9
 * arrow glyph, alone in its own frame) from a tiny status-dot badge (e.g. three identical
 * ~8x8 ellipses side by side) — real examples of both land in the same size range. The
 * distinguishing signal is *clustering*: a badge dot normally appears as one of a small
 * group (2-7) of same-tiny-size vector siblings (a "dots" row), while a standalone icon
 * is typically the only vector in its parent. A large sibling count (8+) instead means
 * this vector is one fragment of a decomposed composite illustration, not a badge or icon.
 */
export function classifyVector(
  node: VectorNode,
  vectorSiblingCount: number,
): { role: RoleLabel; confidence: number } {
  if (vectorSiblingCount >= FRAGMENT_SIBLING_COUNT_THRESHOLD) {
    return { role: "image", confidence: 0.5 };
  }

  const { width, height } = node.geometry.size;
  const longestSide = Math.max(width, height);
  const shortestSide = Math.max(Math.min(width, height), 1);
  const aspectRatio = longestSide / shortestSide;
  const isRoughlySquare = aspectRatio <= ICON_MAX_ASPECT_RATIO;

  const isBadgeClusterSize =
    vectorSiblingCount >= BADGE_CLUSTER_MIN_SIBLINGS && vectorSiblingCount <= BADGE_CLUSTER_MAX_SIBLINGS;
  if (longestSide <= BADGE_MAX_DIMENSION_PX && isRoughlySquare && isBadgeClusterSize) {
    return { role: "badge", confidence: 0.5 };
  }
  if (longestSide <= ICON_MAX_DIMENSION_PX && isRoughlySquare) {
    return { role: "icon", confidence: 0.6 };
  }
  return { role: "image", confidence: 0.55 };
}
