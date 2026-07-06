import { assertNever, err, ok, type DesignNode, type Effect, type Result, type Style } from "@weavensign/schema";
import { absoluteBoxOf, mapGeometry } from "./map-geometry.js";
import { mapFills, mapStrokes } from "./map-paint.js";
import { mapTextContent } from "./map-text.js";
import { RawTextContentSchema } from "./raw-text.js";
import type { RawFill, RawStroke } from "./raw-paint.js";
import type { RawComponentsMap, RawObjectsMap, RawShape } from "./raw-shape.js";
import type { RawSelrect } from "./raw-geometry.js";
import { synthesizeEllipsePath, synthesizeRectPath } from "./synthesize-path.js";

export interface MapContext {
  objects: RawObjectsMap;
  components: RawComponentsMap;
  sourceFileId: string;
}

export type MapNodeError =
  | { kind: "shape-not-found"; shapeId: string }
  | { kind: "unresolved-component-reference"; nodeId: string; componentId: string }
  | { kind: "unsupported-text-content"; nodeId: string };

interface StyleableShape {
  fills?: RawFill[] | undefined;
  strokes?: RawStroke[] | undefined;
  rx?: number | undefined;
}

function mapStyle(shape: StyleableShape): Style {
  const effects: Effect[] = [];
  return {
    fills: mapFills(shape.fills),
    strokes: mapStrokes(shape.strokes),
    effects,
    opacity: 1,
    blendMode: "normal",
    ...(shape.rx === undefined || shape.rx === 0 ? {} : { cornerRadius: shape.rx }),
  };
}

/** Mechanically translates one Penpot shape (and, for containers, its children) into a DesignNode. Pure structural mapping — no role inference; that's the normalization layer's job. */
export function mapNode(shape: RawShape, parentBox: RawSelrect | undefined, context: MapContext): Result<DesignNode, MapNodeError> {
  const geometry = mapGeometry(shape, parentBox);
  const provenance = { source: "penpot" as const, sourceNodeId: shape.id, sourceFileId: context.sourceFileId };
  const base = { id: shape.id, name: shape.name, visible: !shape.hidden, locked: shape.blocked ?? false, geometry, provenance };
  const ownBox = absoluteBoxOf(shape);

  switch (shape.type) {
    case "group": {
      const children = mapChildren(shape.shapes ?? [], ownBox, context);
      if (!children.ok) return children;
      return ok({ ...base, type: "group", children: children.value });
    }

    case "frame": {
      const children = mapChildren(shape.shapes ?? [], ownBox, context);
      if (!children.ok) return children;

      // Penpot has no separate INSTANCE node type — a frame with componentId +
      // componentRoot is the instance wrapper. componentFile/mainInstancePage let a
      // component be defined once and instantiated elsewhere; this adapter only resolves
      // instances within the same file (cross-file library refs are a known gap).
      if (shape.componentId && shape.componentRoot) {
        const meta = context.components[shape.componentId];
        if (!meta) {
          return err({ kind: "unresolved-component-reference", nodeId: shape.id, componentId: shape.componentId });
        }
        return ok({
          ...base,
          type: "component-instance",
          style: mapStyle(shape),
          componentKey: meta.id,
          overrides: {},
          children: children.value,
        });
      }

      return ok({ ...base, type: "frame", style: mapStyle(shape), clipsContent: true, children: children.value });
    }

    case "rect": {
      const data = synthesizeRectPath(geometry.size.width, geometry.size.height, shape.rx ?? 0);
      return ok({ ...base, type: "vector", style: mapStyle(shape), paths: [{ data, windingRule: "nonzero" }] });
    }

    case "circle": {
      const data = synthesizeEllipsePath(geometry.size.width, geometry.size.height);
      return ok({ ...base, type: "vector", style: mapStyle(shape), paths: [{ data, windingRule: "nonzero" }] });
    }

    case "path": {
      const data = typeof shape.content === "string" ? shape.content : "";
      return ok({
        ...base,
        type: "vector",
        style: mapStyle(shape),
        paths: [{ data, windingRule: "nonzero" }],
      });
    }

    case "text": {
      const parsed = RawTextContentSchema.safeParse(shape.content);
      if (!parsed.success) {
        return err({ kind: "unsupported-text-content", nodeId: shape.id });
      }
      return ok({ ...base, type: "text", style: mapStyle(shape), content: mapTextContent(parsed.data) });
    }

    default:
      return assertNever(shape.type);
  }
}

function mapChildren(childIds: string[], parentBox: RawSelrect, context: MapContext): Result<DesignNode[], MapNodeError> {
  const mapped: DesignNode[] = [];
  for (const childId of childIds) {
    const child = context.objects[childId];
    if (!child) {
      return err({ kind: "shape-not-found", shapeId: childId });
    }
    const result = mapNode(child, parentBox, context);
    if (!result.ok) return result;
    mapped.push(result.value);
  }
  return ok(mapped);
}
