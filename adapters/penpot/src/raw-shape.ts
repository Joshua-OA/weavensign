import { z } from "zod";
import { RawSelrectSchema, RawTransformSchema } from "./raw-geometry.js";
import { RawFillSchema, RawStrokeSchema } from "./raw-paint.js";
import { RawTextContentSchema } from "./raw-text.js";

/**
 * Some `rect` shapes (observed live, not in initial sampling) carry a `content` field
 * shaped as a list of path commands (move-to/line-to/curve-to with x/y params) instead
 * of the plain SVG string `path` shapes use — likely Penpot's newer custom-outline/mask
 * representation. This adapter doesn't map it (rects still get their outline from
 * synthesizeRectPath); the schema just needs to accept the shape without erroring so one
 * rect with this field doesn't fail the whole page.
 */
const RawPathCommandContentSchema = z.array(
  z.object({
    command: z.string(),
    relative: z.boolean().optional(),
    params: z.record(z.string(), z.number()).optional(),
  }),
);

/**
 * Penpot's shape types that this adapter maps. BOOL (boolean operations) is intentionally
 * excluded for now — it has no equivalent in the canonical schema yet and is rejected at
 * parse time rather than guessed at (a boolean op's rendered result is path-shaped, but
 * collapsing it to `vector` would silently lose the operation itself).
 */
export const SHAPE_TYPES = ["frame", "group", "rect", "circle", "path", "text"] as const;

/**
 * One entry in a Penpot page's flat `objects` map. Unlike Figma, children aren't nested —
 * every shape on a page is a sibling entry in `objects`, linked by `parentId` and (for
 * container shapes) a `shapes` array of child ids. The adapter reconstructs the tree by
 * walking from the root frame (id "00000000-0000-0000-0000-000000000000") down through
 * `shapes` arrays.
 */
export const RawShapeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(SHAPE_TYPES),
  x: z.number().nullable(),
  y: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  // Observed live: Penpot sends explicit `null` here (not just omitting the field) on
  // some shapes. z.number().default(0) only fills in `undefined`, not `null`, so this
  // needs an explicit transform to collapse both to 0.
  rotation: z
    .number()
    .nullable()
    .optional()
    .transform((value) => value ?? 0),
  selrect: RawSelrectSchema.optional(),
  transform: RawTransformSchema.optional(),
  parentId: z.string().nullable(),
  frameId: z.string().nullable(),
  shapes: z.array(z.string()).optional(),
  fills: z.array(RawFillSchema).optional(),
  strokes: z.array(RawStrokeSchema).optional(),
  rx: z.number().optional(),
  ry: z.number().optional(),
  hidden: z.boolean().optional(),
  blocked: z.boolean().optional(),
  /** SVG-compatible path data string on `path` shapes; rich-text tree on `text` shapes; path-command list on some `rect` shapes (unmapped, see RawPathCommandContentSchema). */
  content: z.union([z.string(), RawTextContentSchema, RawPathCommandContentSchema]).optional(),
  /** Present when this shape is the root of a component instance (Penpot has no separate INSTANCE type — a frame doubles as the instance wrapper). */
  componentId: z.string().optional(),
  componentFile: z.string().optional(),
  componentRoot: z.boolean().optional(),
});
export type RawShape = z.infer<typeof RawShapeSchema>;

export const RawObjectsMapSchema = z.record(z.string(), RawShapeSchema);
export type RawObjectsMap = z.infer<typeof RawObjectsMapSchema>;

export const RawComponentMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type RawComponentMeta = z.infer<typeof RawComponentMetaSchema>;

export const RawComponentsMapSchema = z.record(z.string(), RawComponentMetaSchema);
export type RawComponentsMap = z.infer<typeof RawComponentsMapSchema>;

export const ROOT_FRAME_ID = "00000000-0000-0000-0000-000000000000";
