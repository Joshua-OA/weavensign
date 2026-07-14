import type { DesignNode } from "@weavensign/schema";
import { optimize } from "svgo";
import { renderNode } from "./render-node.js";

/**
 * svgo's default plugin preset (empty options object) is what's used here — no custom
 * plugin list. Pinned to an exact svgo version (package.json) so a transitive patch
 * release can't silently change which optimizations apply and therefore the generated
 * output, per context.md §4.5's determinism rule for anything touching renderer output.
 */
const SVGO_CONFIG = {};

function computeDocumentBounds(roots: DesignNode[]): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const root of roots) {
    maxX = Math.max(maxX, root.geometry.position.x + root.geometry.size.width);
    maxY = Math.max(maxY, root.geometry.position.y + root.geometry.size.height);
  }
  return { width: maxX, height: maxY };
}

/**
 * Renders a full DesignNode[] tree into one self-contained <svg> document string. Pure
 * and deterministic (context.md §4.7): the same input tree always produces the same
 * output string. This is the package's public entry point.
 */
export function renderDocument(roots: DesignNode[]): string {
  const { width, height } = computeDocumentBounds(roots);
  const body = roots.map((node) => renderNode(node)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;

  const result = optimize(svg, SVGO_CONFIG);
  return result.data;
}
