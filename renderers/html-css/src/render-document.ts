import type { DesignNode } from "@weavensign/schema";
import { renderNode } from "./render-node.js";

const BASE_CSS = "html, body { margin: 0; padding: 0; } #weavensign-root { position: relative; }";

/**
 * Renders a full DesignNode[] tree (as produced by an adapter, e.g. one Figma frame's
 * children or one Penpot page's top-level shapes) into a complete, self-contained HTML
 * document string. Pure and deterministic (context.md §4.7): the same input tree always
 * produces the same output string, with no reads of mutable state, randomness, or
 * environment. This is the package's public entry point.
 */
export function renderDocument(roots: DesignNode[]): string {
  const cssRules: string[] = [];
  const bodyHtml = roots.map((node) => renderNode(node, cssRules)).join("");
  const css = [BASE_CSS, ...cssRules].join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${css}
</style>
</head>
<body>
<div id="weavensign-root">${bodyHtml}</div>
</body>
</html>
`;
}
