import { describe, expect, it } from "vitest";
import { DesignNodeSchema } from "./nodes.js";
import { assertNever } from "./assert-never.js";
import type { DesignNode } from "./nodes.js";

function minimalGeometry() {
  return { position: { x: 0, y: 0 }, size: { width: 10, height: 10 } };
}

describe("DesignNodeSchema", () => {
  it("parses a text node", () => {
    const result = DesignNodeSchema.safeParse({
      type: "text",
      id: "1",
      name: "Label",
      geometry: minimalGeometry(),
      style: {},
      content: {
        runs: [{ characters: "Hi", style: { fontFamily: "Inter", fontWeight: 400, fontSizePx: 14 } }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("parses nested frame/group children recursively", () => {
    const result = DesignNodeSchema.safeParse({
      type: "frame",
      id: "root",
      name: "Root",
      geometry: minimalGeometry(),
      style: {},
      clipsContent: true,
      children: [
        {
          type: "group",
          id: "g1",
          name: "Group",
          geometry: minimalGeometry(),
          children: [
            {
              type: "vector",
              id: "v1",
              name: "Vector",
              geometry: minimalGeometry(),
              style: {},
              paths: [{ data: "M0 0L10 10" }],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("parses a component-instance with overrides", () => {
    const result = DesignNodeSchema.safeParse({
      type: "component-instance",
      id: "inst1",
      name: "Button Instance",
      geometry: minimalGeometry(),
      style: {},
      componentKey: "comp-button",
      overrides: { label: "Click me" },
      children: [],
    });
    expect(result.success).toBe(true);
  });

  it("parses a component definition carrying its own stable key", () => {
    const result = DesignNodeSchema.safeParse({
      type: "component",
      id: "comp1",
      name: "Button",
      geometry: minimalGeometry(),
      style: {},
      clipsContent: true,
      key: "6f12eacc-button-primary",
      children: [],
    });
    expect(result.success).toBe(true);
  });

  it("parses a gradient fill with handle positions instead of a raw matrix", () => {
    const result = DesignNodeSchema.safeParse({
      type: "frame",
      id: "grad1",
      name: "Gradient frame",
      geometry: minimalGeometry(),
      clipsContent: true,
      children: [],
      style: {
        fills: [
          {
            type: "gradient",
            gradientKind: "linear",
            stops: [
              { position: 0, color: { r: 1, g: 1, b: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 0 } },
            ],
            handles: {
              start: { x: 0.5, y: -1.5 },
              end: { x: 0.5, y: 2.2 },
              widthAxis: { x: 0.4, y: -1.5 },
            },
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown discriminant", () => {
    const result = DesignNodeSchema.safeParse({
      type: "sticky-note",
      id: "x",
      name: "Bad",
      geometry: minimalGeometry(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a vector node with zero paths", () => {
    const result = DesignNodeSchema.safeParse({
      type: "vector",
      id: "v1",
      name: "Empty vector",
      geometry: minimalGeometry(),
      style: {},
      paths: [],
    });
    expect(result.success).toBe(false);
  });

  it("exhausts all node type variants at compile time via assertNever", () => {
    function describeType(node: DesignNode): string {
      switch (node.type) {
        case "frame":
          return "frame";
        case "group":
          return "group";
        case "text":
          return "text";
        case "vector":
          return "vector";
        case "component":
          return "component";
        case "component-instance":
          return "component-instance";
        default:
          return assertNever(node);
      }
    }
    expect(typeof describeType).toBe("function");
  });
});
