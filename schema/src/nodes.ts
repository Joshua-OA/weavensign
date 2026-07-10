import { z } from "zod";
import { BaseNodeSchema } from "./node-base.js";
import { StyleSchema } from "./style.js";
import { TextContentSchema } from "./typography.js";
import { VectorPathSchema } from "./vector-path.js";

/**
 * DesignNode is recursive (frame/group/component/component-instance contain children).
 * Only the recursive `children` field needs z.lazy(); the node schemas themselves stay
 * plain ZodObjects so z.discriminatedUnion (which requires ZodObject members, not
 * ZodType-wrapped ones) still works. TS can't infer the `children: DesignNode[]` field
 * through that laziness on its own, so DesignNode is written out by hand once, as a
 * typing seam — every field in it is a direct z.output<> alias of its schema, not an
 * independent guess (context.md §4.1: never hand-maintain a parallel type).
 */
type Base = z.output<typeof BaseNodeSchema>;
type Style = z.output<typeof StyleSchema>;

export interface FrameNode extends Base {
  type: "frame";
  style: Style;
  clipsContent: boolean;
  children: DesignNode[];
}

export interface GroupNode extends Base {
  type: "group";
  children: DesignNode[];
}

export interface TextNode extends Base {
  type: "text";
  style: Style;
  content: z.output<typeof TextContentSchema>;
}

export interface VectorNode extends Base {
  type: "vector";
  style: Style;
  paths: z.output<typeof VectorPathSchema>[];
}

export interface ComponentNode extends Base {
  type: "component";
  style: Style;
  clipsContent: boolean;
  /** Stable cross-file identity of this component definition (Figma: `key`; Penpot: component id). Instances reference this, never the node id. */
  key: string;
  children: DesignNode[];
}

export interface ComponentInstanceNode extends Base {
  type: "component-instance";
  style: Style;
  /** The `key` of the ComponentNode this instance was created from — resolved by the adapter, not the node-local reference id the source format uses internally. */
  componentKey: string;
  /** Property overrides applied on top of the referenced component's defaults; adapters resolve these, renderers must not need to. */
  overrides: Record<string, unknown>;
  children: DesignNode[];
}

export type DesignNode =
  | FrameNode
  | GroupNode
  | TextNode
  | VectorNode
  | ComponentNode
  | ComponentInstanceNode;

function childrenSchema(): z.ZodType<DesignNode[], unknown> {
  return z.lazy(() => z.array(DesignNodeSchema)) as unknown as z.ZodType<DesignNode[], unknown>;
}

export const FrameNodeSchema = z.object({
  ...BaseNodeSchema.shape,
  type: z.literal("frame"),
  style: StyleSchema,
  clipsContent: z.boolean().default(true),
  children: childrenSchema(),
});

export const GroupNodeSchema = z.object({
  ...BaseNodeSchema.shape,
  type: z.literal("group"),
  children: childrenSchema(),
});

export const TextNodeSchema = z.object({
  ...BaseNodeSchema.shape,
  type: z.literal("text"),
  style: StyleSchema,
  content: TextContentSchema,
});

export const VectorNodeSchema = z.object({
  ...BaseNodeSchema.shape,
  type: z.literal("vector"),
  style: StyleSchema,
  paths: z.array(VectorPathSchema).min(1),
});

export const ComponentNodeSchema = z.object({
  ...BaseNodeSchema.shape,
  type: z.literal("component"),
  style: StyleSchema,
  clipsContent: z.boolean().default(true),
  key: z.string(),
  children: childrenSchema(),
});

export const ComponentInstanceNodeSchema = z.object({
  ...BaseNodeSchema.shape,
  type: z.literal("component-instance"),
  style: StyleSchema,
  componentKey: z.string(),
  overrides: z.record(z.string(), z.unknown()),
  children: childrenSchema(),
});

export const DesignNodeSchema: z.ZodType<DesignNode, unknown> = z.lazy(() =>
  z.discriminatedUnion("type", [
    FrameNodeSchema,
    GroupNodeSchema,
    TextNodeSchema,
    VectorNodeSchema,
    ComponentNodeSchema,
    ComponentInstanceNodeSchema,
  ]),
);
