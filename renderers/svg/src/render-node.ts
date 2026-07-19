import { formatNumber } from "@weavensign/renderer-shared";
import { assertNever, type DesignNode } from "@weavensign/schema";
import { escapeXml } from "./escape-xml.js";
import { renderText } from "./render-text.js";
import { renderVector } from "./render-vector.js";
import { attributesToXml, imagePreserveAspectRatio, isResolvedImageUrl, styleAttributes } from "./svg-attributes.js";

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

/**
 * A container's background, if any, is a plain <rect> spanning the container's own
 * size — <g> has no fill of its own in SVG, unlike a CSS box which paints
 * background-color on the element itself. Only emitted when the container actually has
 * a fill; an empty style (fill: none via styleAttributes) would otherwise paint an
 * invisible-but-present rect for every plain group, which is harmless visually but
 * needless output. A resolved image fill (real URL, not Figma's raw hash) renders as a
 * real <image> element instead of a filled <rect> — SVG shapes can't paint a raster URL
 * as a `fill` attribute the way a CSS box can with `background-image`.
 */
function renderContainerBackground(node: DesignNode): string {
  if (!("style" in node)) {
    return "";
  }
  const imageFill = node.style.fills.find((fill) => fill.type === "image");
  const hasFill = node.style.fills.some((fill) => fill.type === "solid" || fill.type === "image");
  if (!hasFill) {
    return "";
  }
  const { width, height } = node.geometry.size;

  if (imageFill && isResolvedImageUrl(imageFill.assetRef)) {
    const aspectRatio = imagePreserveAspectRatio(imageFill.scaleMode);
    return `<image width="${formatNumber(width)}" height="${formatNumber(height)}" href="${imageFill.assetRef}" preserveAspectRatio="${aspectRatio}"/>`;
  }

  const attrs = attributesToXml(styleAttributes(node.style));
  const cornerAttr = node.style.cornerRadius !== undefined ? ` rx="${formatNumber(node.style.cornerRadius)}"` : "";
  return `<rect width="${formatNumber(width)}" height="${formatNumber(height)}"${cornerAttr} ${attrs}/>`;
}

/**
 * Renders one DesignNode (and, for containers, its full subtree) as an SVG fragment.
 * Every node is a <g> translated to its parent-relative position (SVG's native
 * coordinate composition — no `position: absolute` equivalent needed, unlike the HTML/
 * JSX renderers; see render-vector.ts's doc comment). Invisible nodes (visible: false)
 * are skipped entirely, same rule as the other two renderers.
 */
export function renderNode(node: DesignNode): string {
  if (node.visible === false) {
    return "";
  }

  switch (node.type) {
    case "text": {
      const transform = `translate(${formatNumber(node.geometry.position.x)}, ${formatNumber(node.geometry.position.y)})`;
      return `<g transform="${transform}">${renderText(node)}</g>`;
    }
    case "vector":
      return renderVector(node);
    case "frame":
    case "group":
    case "component":
    case "component-instance": {
      const transform = `translate(${formatNumber(node.geometry.position.x)}, ${formatNumber(node.geometry.position.y)})`;
      const background = renderContainerBackground(node);
      const childrenSvg = childrenOf(node)
        .map((child) => renderNode(child))
        .join("");
      return `<g transform="${transform}"><title>${escapeXml(node.name)}</title>${background}${childrenSvg}</g>`;
    }
    default:
      return assertNever(node);
  }
}
