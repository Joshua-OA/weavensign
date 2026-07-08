import { assertNever, err, ok, type DesignNode, type Effect, type Result, type Style } from "@weavensign/schema";
import { mapGeometry } from "./map-geometry.js";
import { mapFills, mapStrokes } from "./map-paint.js";
import { mapTextContent } from "./map-text.js";
import type { RawNode } from "./raw-node.js";
import type { RawPaint } from "./raw-paint.js";
import type { RawComponentMeta } from "./raw-file-response.js";

export interface MapContext {
  /** File-scoped `components` map from the REST response: node id -> stable definition key. Needed to resolve INSTANCE.componentId into ComponentInstanceNode.componentKey. */
  components: Record<string, RawComponentMeta>;
  sourceFileId: string;
}

export type MapNodeError = { kind: "unresolved-component-reference"; nodeId: string; componentId: string };

interface StyleableRawNode {
  fills?: RawPaint[] | undefined;
  strokes?: RawPaint[] | undefined;
  strokeWeight?: number | undefined;
  strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER" | undefined;
  opacity?: number | undefined;
  cornerRadius?: number | undefined;
}

function mapStyle(node: StyleableRawNode): Style {
  const effects: Effect[] = [];
  return {
    fills: mapFills(node.fills),
    strokes: mapStrokes(node.strokes, node.strokeWeight, node.strokeAlign),
    effects,
    opacity: node.opacity ?? 1,
    blendMode: "normal",
    ...(node.cornerRadius === undefined ? {} : { cornerRadius: node.cornerRadius }),
  };
}

/** Mechanically translates one parsed Figma node (and its children) into a DesignNode. Pure structural mapping — no role inference, no heuristics; that's the normalization layer's job. */
export function mapNode(node: RawNode, context: MapContext): Result<DesignNode, MapNodeError> {
  const geometry = mapGeometry(node.absoluteBoundingBox, node.relativeTransform, node.size);
  const provenance = { source: "figma" as const, sourceNodeId: node.id, sourceFileId: context.sourceFileId };
  const base = { id: node.id, name: node.name, visible: node.visible ?? true, locked: node.locked ?? false, geometry, provenance };

  switch (node.type) {
    case "GROUP": {
      const children = mapChildren(node.children, context);
      if (!children.ok) return children;
      return ok({ ...base, type: "group", children: children.value });
    }

    case "FRAME": {
      const children = mapChildren(node.children, context);
      if (!children.ok) return children;
      return ok({ ...base, type: "frame", style: mapStyle(node), clipsContent: node.clipsContent, children: children.value });
    }

    case "TEXT":
      return ok({ ...base, type: "text", style: mapStyle(node), content: mapTextContent(node.characters, node.style) });

    case "COMPONENT": {
      const children = mapChildren(node.children, context);
      if (!children.ok) return children;
      const meta = context.components[node.id];
      return ok({
        ...base,
        type: "component",
        style: mapStyle(node),
        clipsContent: node.clipsContent,
        key: meta?.key ?? node.id,
        children: children.value,
      });
    }

    case "INSTANCE": {
      const children = mapChildren(node.children, context);
      if (!children.ok) return children;
      const meta = context.components[node.componentId];
      if (!meta) {
        return err({ kind: "unresolved-component-reference", nodeId: node.id, componentId: node.componentId });
      }
      return ok({
        ...base,
        type: "component-instance",
        style: mapStyle(node),
        componentKey: meta.key,
        overrides: node.componentProperties ?? {},
        children: children.value,
      });
    }

    case "VECTOR":
    case "RECTANGLE":
    case "ELLIPSE":
    case "LINE":
    case "REGULAR_POLYGON":
    case "STAR":
      return ok({
        ...base,
        type: "vector",
        style: mapStyle(node),
        // Stroke-only shapes (e.g. a LINE with no fill) have empty fillGeometry; their
        // visible outline is in strokeGeometry instead.
        paths: (node.fillGeometry?.length ? node.fillGeometry : (node.strokeGeometry ?? [])).map(
          (pathGeometry) => ({
            data: pathGeometry.path,
            windingRule: pathGeometry.windingRule.toLowerCase() as "nonzero" | "evenodd",
          }),
        ),
      });

    default:
      return assertNever(node);
  }
}

function mapChildren(children: RawNode[], context: MapContext): Result<DesignNode[], MapNodeError> {
  const mapped: DesignNode[] = [];
  for (const child of children) {
    const result = mapNode(child, context);
    if (!result.ok) return result;
    mapped.push(result.value);
  }
  return ok(mapped);
}
