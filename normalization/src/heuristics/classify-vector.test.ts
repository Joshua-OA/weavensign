import { describe, expect, it } from "vitest";
import type { DesignNode, VectorNode } from "@weavensign/schema";
import { classifyVector } from "./classify-vector.js";

function makeVector(width: number, height: number, overrides: Partial<VectorNode> = {}): VectorNode {
  return {
    id: "1",
    name: "test",
    visible: true,
    locked: false,
    geometry: { position: { x: 0, y: 0 }, size: { width, height }, rotationDegrees: 0 },
    type: "vector",
    style: { fills: [], strokes: [], effects: [], opacity: 1, blendMode: "normal" },
    paths: [{ data: "M0 0", windingRule: "nonzero" }],
    ...overrides,
  };
}

function makeTextChild(id: string): DesignNode {
  return {
    id,
    name: "label",
    visible: true,
    locked: false,
    geometry: { position: { x: 0, y: 0 }, size: { width: 40, height: 16 }, rotationDegrees: 0 },
    type: "text",
    style: { fills: [], strokes: [], effects: [], opacity: 1, blendMode: "normal" },
    content: {
      runs: [
        {
          characters: "Button",
          style: {
            fontFamily: "Inter",
            fontSizePx: 14,
            fontWeight: 400,
            fontStyle: "normal",
            letterSpacingPx: 0,
            textDecoration: "none",
            textCase: "none",
          },
        },
      ],
      align: "left",
      autoResize: "none",
    },
  };
}

function makeButtonParent(bg: VectorNode, width: number, height: number): DesignNode {
  return {
    id: "parent",
    name: "Button-1",
    visible: true,
    locked: false,
    geometry: { position: { x: 0, y: 0 }, size: { width, height }, rotationDegrees: 0 },
    type: "component-instance",
    style: { fills: [], strokes: [], effects: [], opacity: 1, blendMode: "normal" },
    componentKey: "k",
    overrides: {},
    children: [bg, makeTextChild("2")],
  };
}

describe("classifyVector", () => {
  it("classifies a small square shape with few vector siblings as an icon", () => {
    expect(classifyVector(makeVector(24, 24), 1, undefined).role).toBe("icon");
  });

  it("classifies a large shape as an image", () => {
    expect(classifyVector(makeVector(400, 300), 1, undefined).role).toBe("image");
  });

  it("classifies a small but elongated shape as an image, not an icon", () => {
    expect(classifyVector(makeVector(47, 8), 1, undefined).role).toBe("image");
  });

  it("classifies a hairline shape (near-zero short side) as other, not an image", () => {
    expect(classifyVector(makeVector(260, 1), 1, undefined).role).toBe("other");
  });

  it("classifies a small shape with many vector siblings as an image fragment, not an icon", () => {
    expect(classifyVector(makeVector(20, 20), 50, undefined).role).toBe("image");
  });

  it("classifies a tiny square shape clustered with a few similar siblings (status dots) as a badge", () => {
    expect(classifyVector(makeVector(8, 8), 3, undefined).role).toBe("badge");
  });

  it("classifies a tiny square shape alone (no cluster) as an icon, not a badge", () => {
    expect(classifyVector(makeVector(8, 8), 1, undefined).role).toBe("icon");
  });

  it("classifies a shape named icon_avatar as an avatar regardless of sibling count", () => {
    const avatar = makeVector(25, 28, { name: "icon_avatar" });
    expect(classifyVector(avatar, 4, undefined).role).toBe("avatar");
  });

  it("does not classify a large shape merely containing 'avatar' in an unrelated way as an avatar", () => {
    const notAvatar = makeVector(400, 300, { name: "avatar-bg-illustration" });
    expect(classifyVector(notAvatar, 1, undefined).role).toBe("image");
  });

  it("classifies a button's own full-width background rect as other, not image (learning_v0.md #024)", () => {
    const bg = makeVector(140, 42, { name: "Rect-9" });
    const parent = makeButtonParent(bg, 140, 42);
    expect(classifyVector(bg, 1, parent).role).toBe("other");
  });

  it("still classifies a named bg-N shape as icon even when it also matches the button-background shape", () => {
    const bg = makeVector(230, 60, { name: "bg-5" });
    const parent = makeButtonParent(bg, 230, 60);
    expect(classifyVector(bg, 1, parent).role).toBe("icon");
  });

  it("does not misclassify a large standalone image as other just because its parent has two children", () => {
    const image = makeVector(400, 300, { name: "photo" });
    const parent = makeButtonParent(image, 100, 100);
    expect(classifyVector(image, 1, parent).role).toBe("image");
  });
});
