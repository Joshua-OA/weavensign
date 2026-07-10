import { z } from "zod";
import { RawBoundingBoxSchema, RawSizeSchema, RawTransformSchema } from "./raw-geometry.js";
import { RawFillGeometrySchema, RawPaintSchema } from "./raw-paint.js";
import { RawTextStyleSchema } from "./raw-text.js";

const RawComponentPropertySchema = z.object({ type: z.string(), value: z.unknown() });
type RawComponentProperty = z.output<typeof RawComponentPropertySchema>;

/**
 * Figma's vector-like leaf types (VECTOR, RECTANGLE, ELLIPSE, LINE, REGULAR_POLYGON,
 * STAR) all carry the same fillGeometry/strokeGeometry path data and map to our single
 * canonical `vector` node — the distinction between "ellipse" and "star" is presentation
 * metadata Figma keeps for its own editing UI, not a difference the rendered output needs.
 */
export const VECTOR_LEAF_TYPES = [
  "VECTOR",
  "RECTANGLE",
  "ELLIPSE",
  "LINE",
  "REGULAR_POLYGON",
  "STAR",
] as const;

const RawNodeCommonShape = {
  id: z.string(),
  name: z.string(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  absoluteBoundingBox: RawBoundingBoxSchema,
  relativeTransform: RawTransformSchema.optional(),
  size: RawSizeSchema.optional(),
  fills: z.array(RawPaintSchema).optional(),
  strokes: z.array(RawPaintSchema).optional(),
  strokeWeight: z.number().optional(),
  strokeAlign: z.enum(["INSIDE", "OUTSIDE", "CENTER"]).optional(),
  opacity: z.number().optional(),
  cornerRadius: z.number().optional(),
  blendMode: z.string().optional(),
};
type RawNodeCommon = {
  id: string;
  name: string;
  visible?: boolean | undefined;
  locked?: boolean | undefined;
  absoluteBoundingBox: z.output<typeof RawBoundingBoxSchema>;
  relativeTransform?: z.output<typeof RawTransformSchema> | undefined;
  size?: z.output<typeof RawSizeSchema> | undefined;
  fills?: z.output<typeof RawPaintSchema>[] | undefined;
  strokes?: z.output<typeof RawPaintSchema>[] | undefined;
  strokeWeight?: number | undefined;
  strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER" | undefined;
  opacity?: number | undefined;
  cornerRadius?: number | undefined;
  blendMode?: string | undefined;
};

export type RawNode =
  | RawFrameNode
  | RawGroupNode
  | RawVectorLikeNode
  | RawTextNode
  | RawComponentNode
  | RawInstanceNode;

export interface RawFrameNode extends RawNodeCommon {
  type: "FRAME";
  clipsContent: boolean;
  children: RawNode[];
}

export interface RawGroupNode extends RawNodeCommon {
  type: "GROUP";
  children: RawNode[];
}

export interface RawVectorLikeNode extends RawNodeCommon {
  type: (typeof VECTOR_LEAF_TYPES)[number];
  fillGeometry?: z.output<typeof RawFillGeometrySchema>[] | undefined;
  strokeGeometry?: z.output<typeof RawFillGeometrySchema>[] | undefined;
}

export interface RawTextNode extends RawNodeCommon {
  type: "TEXT";
  characters: string;
  style: z.output<typeof RawTextStyleSchema>;
}

export interface RawComponentNode extends RawNodeCommon {
  type: "COMPONENT";
  clipsContent: boolean;
  children: RawNode[];
}

export interface RawInstanceNode extends RawNodeCommon {
  type: "INSTANCE";
  clipsContent: boolean;
  componentId: string;
  componentProperties?: Record<string, RawComponentProperty> | undefined;
  children: RawNode[];
}

function childrenSchema(): z.ZodType<RawNode[], unknown> {
  return z.lazy(() => z.array(RawNodeSchema)) as unknown as z.ZodType<RawNode[], unknown>;
}

export const RawFrameNodeSchema = z.object({
  ...RawNodeCommonShape,
  type: z.literal("FRAME"),
  clipsContent: z.boolean().default(true),
  children: childrenSchema(),
});

export const RawGroupNodeSchema = z.object({
  ...RawNodeCommonShape,
  type: z.literal("GROUP"),
  children: childrenSchema(),
});

export const RawVectorLikeNodeSchema = z.object({
  ...RawNodeCommonShape,
  type: z.enum(VECTOR_LEAF_TYPES),
  fillGeometry: z.array(RawFillGeometrySchema).optional(),
  // Stroke-only shapes (e.g. a LINE with no fill) have empty fillGeometry — their visible
  // outline lives here instead. Used as a fallback when fillGeometry is empty.
  strokeGeometry: z.array(RawFillGeometrySchema).optional(),
});

export const RawTextNodeSchema = z.object({
  ...RawNodeCommonShape,
  type: z.literal("TEXT"),
  characters: z.string(),
  style: RawTextStyleSchema,
});

export const RawComponentNodeSchema = z.object({
  ...RawNodeCommonShape,
  type: z.literal("COMPONENT"),
  clipsContent: z.boolean().default(true),
  children: childrenSchema(),
});

export const RawInstanceNodeSchema = z.object({
  ...RawNodeCommonShape,
  type: z.literal("INSTANCE"),
  clipsContent: z.boolean().default(true),
  componentId: z.string(),
  componentProperties: z.record(z.string(), RawComponentPropertySchema).optional(),
  children: childrenSchema(),
});

export const RawNodeSchema: z.ZodType<RawNode, unknown> = z.lazy(() =>
  z.discriminatedUnion("type", [
    RawFrameNodeSchema,
    RawGroupNodeSchema,
    RawTextNodeSchema,
    RawComponentNodeSchema,
    RawInstanceNodeSchema,
    // Vector-like types share one schema but multiple literal `type` values, which
    // z.discriminatedUnion can't express as a single option — each is spread in below.
    ...VECTOR_LEAF_TYPES.map((leafType) =>
      RawVectorLikeNodeSchema.extend({ type: z.literal(leafType) }),
    ),
  ]),
);
