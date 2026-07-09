import type { DesignNode } from "@weavensign/schema";
import type { RoleLabel } from "../role-label.js";

const CARD_MIN_SIDE_PX = 100;
const REPEATED_CARD_MIN_SIDE_PX = 30;
const CARD_MAX_ASPECT_RATIO = 4;
const REPEATED_SIBLING_THRESHOLD = 2;

const BUTTON_MIN_HEIGHT_PX = 20;
const BUTTON_MAX_HEIGHT_PX = 60;
const BUTTON_MIN_WIDTH_PX = 60;
const BUTTON_BACKGROUND_WIDTH_RATIO = 0.85;

const BADGE_MAX_HEIGHT_PX = 20;

const NAV_ITEM_MAX_SIDE_PX = 26;
const NAV_ITEM_SIBLING_THRESHOLD = 2;

const INPUT_FIELD_MIN_HEIGHT_PX = 25;
const INPUT_FIELD_MAX_HEIGHT_PX = 45;

/**
 * Strips a trailing `-<number>` / `(<number>)` suffix Penpot appends to duplicated layer
 * names (Figma repeats the exact name instead). Deliberately does not strip a bare
 * space-separated trailing number (`"Group 15"`) — that's Figma's own generic
 * auto-incrementing default name for *unrelated* layers, not a duplicate-instance marker;
 * stripping it would collide sibling "Group 15"/"Group 16"/... into a false repeat match.
 */
function normalizeName(name: string): string {
  return name.replace(/-\d+$/, "").replace(/\s?\(\d+\)$/, "");
}

/** Counts how many siblings (including this node) share the same base name, ignoring a trailing duplicate-number suffix — a strong signal for a repeated component like a product/content card. */
function countSiblingsWithSameName(node: DesignNode, siblings: DesignNode[]): number {
  const base = normalizeName(node.name);
  return siblings.filter((sibling) => normalizeName(sibling.name) === base).length;
}

/** True when every child of a container is a vector (no text, no nested container) — the shape of a Penpot icon-group nav item (background + path, or just a path). */
function isAllVectorChildren(node: DesignNode): boolean {
  return "children" in node && node.children.length > 0 && node.children.every((child) => child.type === "vector");
}

/**
 * True when a container looks like a button: one text label plus one non-text child
 * (icon or background) that spans nearly the full container width, in a small/medium
 * pill-like size range. The full-width-background check is what separates a real button
 * (background rect sized to the label) from a same-size icon+label nav/breadcrumb pair,
 * where the icon is much narrower than its neighboring text (see learning_v0.md #022/#023).
 */
function looksLikeButton(node: DesignNode): boolean {
  if (!("children" in node) || node.children.length !== 2) return false;
  const { width, height } = node.geometry.size;
  if (height < BUTTON_MIN_HEIGHT_PX || height > BUTTON_MAX_HEIGHT_PX || width < BUTTON_MIN_WIDTH_PX) return false;

  const textChildren = node.children.filter((child) => child.type === "text");
  const nonTextChildren = node.children.filter((child) => child.type !== "text");
  if (textChildren.length !== 1 || nonTextChildren.length !== 1) return false;

  const nonTextWidth = nonTextChildren[0]!.geometry.size.width;
  return nonTextWidth / width >= BUTTON_BACKGROUND_WIDTH_RATIO;
}

/**
 * True when a container looks like a small stat/status badge: two text runs (label +
 * value) plus a background vector, all inside a pill short enough that it can't also be
 * a button (badges here run ~16px tall vs a button's ~40px).
 */
function looksLikeBadge(node: DesignNode): boolean {
  if (!("children" in node) || node.children.length < 2) return false;
  const { height } = node.geometry.size;
  if (height > BADGE_MAX_HEIGHT_PX) return false;

  const textChildren = node.children.filter((child) => child.type === "text");
  const hasBackground = node.children.some((child) => child.type === "vector");
  return textChildren.length >= 2 && hasBackground;
}

/**
 * True when a container looks like an icon-group nav item: small square, made entirely
 * of vector children (no text — Penpot represents nav icons as background+path vector
 * groups, see learning_v0.md #022), and repeated several times among siblings (a nav rail).
 */
function looksLikeNavItem(node: DesignNode, siblings: DesignNode[]): boolean {
  const { width, height } = node.geometry.size;
  if (Math.max(width, height) > NAV_ITEM_MAX_SIDE_PX) return false;
  if (!isAllVectorChildren(node)) return false;

  const sameShapeSiblingCount = siblings.filter(
    (sibling) => isAllVectorChildren(sibling) && Math.max(sibling.geometry.size.width, sibling.geometry.size.height) <= NAV_ITEM_MAX_SIDE_PX,
  ).length;
  return sameShapeSiblingCount >= NAV_ITEM_SIBLING_THRESHOLD;
}

/**
 * True when a container looks like a search box: exactly one vector child whose name
 * literally identifies it as a search icon, plus exactly one text child (the query text
 * or placeholder). Only one real sample of this shape exists in the eval set so far
 * (Penpot's `search` group + `icon_search` child) — narrow, name-anchored on purpose
 * rather than guessed from size/proportion alone.
 */
function looksLikeSearchBox(node: DesignNode): boolean {
  if (!("children" in node) || node.children.length !== 2) return false;
  const textChildren = node.children.filter((child) => child.type === "text");
  const vectorChildren = node.children.filter((child) => child.type === "vector");
  if (textChildren.length !== 1 || vectorChildren.length !== 1) return false;
  return /search/i.test(vectorChildren[0]!.name);
}

/**
 * True when a container looks like a text-entry field: exactly one background vector
 * plus exactly two text runs (value/placeholder + a hint or label), in a height band
 * between a badge's (~16px) and a card's (~50px+) — real ground-truth examples
 * (Penpot's `Group-3` message-input pill) sit at ~40px, distinct from both neighbors.
 */
function looksLikeInputField(node: DesignNode): boolean {
  if (!("children" in node) || node.children.length !== 3) return false;
  const { height } = node.geometry.size;
  if (height < INPUT_FIELD_MIN_HEIGHT_PX || height > INPUT_FIELD_MAX_HEIGHT_PX) return false;

  const textChildren = node.children.filter((child) => child.type === "text");
  const vectorChildren = node.children.filter((child) => child.type === "vector");
  return textChildren.length === 2 && vectorChildren.length === 1;
}

/**
 * Classifies a container node (frame/group/component/component-instance). Checks
 * structural shapes specific enough to be unambiguous first (button, badge, nav-item,
 * search-box, input-field — each has a distinctive child-composition signature), then
 * falls back to the original repetition/proportions-based card signal, then "other" for
 * anything matching none of the above rather than a guess — a container's role is the
 * least visually self-evident of any node kind here.
 */
export function classifyContainer(
  node: DesignNode,
  siblings: DesignNode[],
): { role: RoleLabel; confidence: number } {
  if (looksLikeButton(node)) {
    return { role: "button", confidence: 0.6 };
  }
  if (looksLikeBadge(node)) {
    return { role: "badge", confidence: 0.55 };
  }
  if (looksLikeNavItem(node, siblings)) {
    return { role: "nav-item", confidence: 0.55 };
  }
  if (looksLikeSearchBox(node)) {
    return { role: "input-field", confidence: 0.6 };
  }
  if (looksLikeInputField(node)) {
    return { role: "input-field", confidence: 0.5 };
  }

  const { width, height } = node.geometry.size;
  const longestSide = Math.max(width, height);
  const shortestSide = Math.max(Math.min(width, height), 1);
  const aspectRatio = longestSide / shortestSide;
  const looksCardProportioned = aspectRatio <= CARD_MAX_ASPECT_RATIO;

  const repeatCount = countSiblingsWithSameName(node, siblings);
  const looksLikeRepeatedCard =
    repeatCount >= REPEATED_SIBLING_THRESHOLD && looksCardProportioned && shortestSide >= REPEATED_CARD_MIN_SIDE_PX;
  const looksLikeStandaloneCard =
    looksCardProportioned && shortestSide >= CARD_MIN_SIDE_PX && "children" in node && node.children.length >= 3;

  if (looksLikeRepeatedCard) {
    return { role: "card", confidence: 0.65 };
  }
  if (looksLikeStandaloneCard) {
    return { role: "card", confidence: 0.4 };
  }
  return { role: "other", confidence: 0.3 };
}
