import type { DesignNode, VectorNode } from "@weavensign/schema";
import type { RoleLabel } from "../role-label.js";

const BADGE_MAX_DIMENSION_PX = 16;
const ICON_MAX_DIMENSION_PX = 48;
const ICON_MAX_ASPECT_RATIO = 2;
const FRAGMENT_SIBLING_COUNT_THRESHOLD = 8;
const BADGE_CLUSTER_MIN_SIBLINGS = 2;
const BADGE_CLUSTER_MAX_SIBLINGS = 7;
const AVATAR_MAX_ASPECT_RATIO = 1.5;
const AVATAR_MAX_DIMENSION_PX = 40;
const HAIRLINE_MAX_SHORT_SIDE_PX = 1;
const BUTTON_BG_MIN_HEIGHT_PX = 20;
const BUTTON_BG_MAX_HEIGHT_PX = 60;
const BUTTON_BG_MIN_WIDTH_PX = 60;
const BUTTON_BG_WIDTH_RATIO = 0.85;

/**
 * True when this vector is itself the background rect of a button-shaped parent: the
 * parent has exactly one text child and this vector as its only other child, sized to
 * near-full parent width, in a pill-like height range. Same structural signature
 * classify-container.ts's looksLikeButton uses on the parent — checked here from the
 * vector's own side because classify-node.ts classifies each node independently and this
 * vector would otherwise fall into the size-based `image` fallback below (see
 * learning_v0.md #024's deferred parent-context gap).
 */
function isButtonBackgroundShape(node: VectorNode, parent: DesignNode | undefined): boolean {
  if (!parent || !("children" in parent) || parent.children.length !== 2) return false;
  const { width, height } = parent.geometry.size;
  if (height < BUTTON_BG_MIN_HEIGHT_PX || height > BUTTON_BG_MAX_HEIGHT_PX || width < BUTTON_BG_MIN_WIDTH_PX) {
    return false;
  }
  const textChildren = parent.children.filter((child) => child.type === "text");
  const nonTextChildren = parent.children.filter((child) => child.type !== "text");
  if (textChildren.length !== 1 || nonTextChildren.length !== 1 || nonTextChildren[0]!.id !== node.id) return false;
  return node.geometry.size.width / width >= BUTTON_BG_WIDTH_RATIO;
}

/**
 * True when a vector's own name literally identifies it as an avatar. Penpot's stock
 * dashboard template names avatar shapes `icon_avatar` (a boolean-unioned circle
 * flattened to one path by the time it reaches the API, see learning_v0.md #021) — a
 * real, generalizable authoring convention, not a fixture-specific label to special-case.
 */
function isAvatarShape(node: VectorNode): boolean {
  if (!/avatar/i.test(node.name)) return false;
  const { width, height } = node.geometry.size;
  const longestSide = Math.max(width, height);
  const shortestSide = Math.max(Math.min(width, height), 1);
  return longestSide <= AVATAR_MAX_DIMENSION_PX && longestSide / shortestSide <= AVATAR_MAX_ASPECT_RATIO;
}

/**
 * True when a vector's own name literally identifies it as a decorative background
 * shape (Penpot's `bg` / `bg-2` / `bg-3` ... naming convention for a card/row/button's
 * backdrop rect, distinct from a real content rect like `Rect-N`/`Circle-N`/`graph`).
 * A large `bg`-named rect would otherwise fall into this function's size-based `image`
 * fallback (see learning_v0.md #024) even though it's never real image content — it's
 * the flat-color panel a card's real content (text, other vectors) sits on top of.
 */
function isNamedBackgroundShape(node: VectorNode): boolean {
  return /^bg(-\d+)?$/.test(node.name);
}

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
  parent: DesignNode | undefined,
): { role: RoleLabel; confidence: number } {
  if (isAvatarShape(node)) {
    return { role: "avatar", confidence: 0.6 };
  }
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
  if (isNamedBackgroundShape(node)) {
    return { role: "icon", confidence: 0.35 };
  }
  if (isButtonBackgroundShape(node, parent)) {
    return { role: "other", confidence: 0.45 };
  }
  if (shortestSide <= HAIRLINE_MAX_SHORT_SIDE_PX) {
    return { role: "other", confidence: 0.4 };
  }
  return { role: "image", confidence: 0.55 };
}
