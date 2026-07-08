import type { TextNode } from "@weavensign/schema";
import type { RoleLabel } from "../role-label.js";

const HEADING_MIN_FONT_SIZE_PX = 24;
const SHORT_LABEL_MAX_CHARS = 20;

const BUTTON_LABEL_WORDS = ["add to cart", "buy now", "checkout", "submit", "sign up", "log in", "sign in", "subscribe", "learn more", "get started"];
const NAV_LABEL_WORDS = ["home", "cart", "account", "menu", "shop", "about", "contact", "privacy policy", "terms", "next", "previous"];

function fullText(node: TextNode): string {
  return node.content.runs.map((run) => run.characters).join("");
}

function matchesAnyWord(text: string, words: string[]): boolean {
  const normalized = text.trim().toLowerCase();
  return words.some((word) => normalized === word || normalized.startsWith(`${word} `));
}

/**
 * Classifies a text node using font size (heading vs body) and a small dictionary of
 * common UI label phrases (button/nav). Deliberately does not attempt to detect `badge`
 * from text alone: real badge text (short category tags, counts) is not reliably
 * distinguishable from other short UI strings (prices, captions) by length or size —
 * badges are usually recognizable by a pill/dot-shaped background the text sits in, which
 * needs fill/shape data this function doesn't have. A tried parent-container-size signal
 * for this was removed after live scoring showed it never actually fired on real badge
 * text (see learning_v0.md #020) — badge detection for text nodes is left as a known gap
 * rather than forcing an unreliable guess.
 */
export function classifyText(node: TextNode): { role: RoleLabel; confidence: number } {
  const text = fullText(node);
  const largestFontSize = Math.max(...node.content.runs.map((run) => run.style.fontSizePx));

  if (matchesAnyWord(text, BUTTON_LABEL_WORDS)) {
    return { role: "button", confidence: 0.7 };
  }
  if (matchesAnyWord(text, NAV_LABEL_WORDS)) {
    return { role: "nav-item", confidence: 0.55 };
  }
  if (largestFontSize >= HEADING_MIN_FONT_SIZE_PX && text.trim().length <= SHORT_LABEL_MAX_CHARS * 3) {
    return { role: "heading", confidence: 0.6 };
  }
  return { role: "body-text", confidence: 0.5 };
}
