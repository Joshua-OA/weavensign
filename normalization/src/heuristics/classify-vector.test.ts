import { describe, expect, it } from "vitest";
import type { VectorNode } from "@weavensign/schema";
import { classifyVector } from "./classify-vector.js";

function makeVector(width: number, height: number): VectorNode {
  return {
    id: "1",
    name: "test",
    visible: true,
    locked: false,
    geometry: { position: { x: 0, y: 0 }, size: { width, height }, rotationDegrees: 0 },
    type: "vector",
    style: { fills: [], strokes: [], effects: [], opacity: 1, blendMode: "normal" },
    paths: [{ data: "M0 0", windingRule: "nonzero" }],
  };
}

describe("classifyVector", () => {
  it("classifies a small square shape with few vector siblings as an icon", () => {
    expect(classifyVector(makeVector(24, 24), 1).role).toBe("icon");
  });

  it("classifies a large shape as an image", () => {
    expect(classifyVector(makeVector(400, 300), 1).role).toBe("image");
  });

  it("classifies a small but elongated shape as an image, not an icon", () => {
    expect(classifyVector(makeVector(47, 8), 1).role).toBe("image");
  });

  it("classifies a hairline shape (near-zero short side) as other, not an image", () => {
    expect(classifyVector(makeVector(260, 1), 1).role).toBe("other");
  });

  it("classifies a small shape with many vector siblings as an image fragment, not an icon", () => {
    expect(classifyVector(makeVector(20, 20), 50).role).toBe("image");
  });

  it("classifies a tiny square shape clustered with a few similar siblings (status dots) as a badge", () => {
    expect(classifyVector(makeVector(8, 8), 3).role).toBe("badge");
  });

  it("classifies a tiny square shape alone (no cluster) as an icon, not a badge", () => {
    expect(classifyVector(makeVector(8, 8), 1).role).toBe("icon");
  });

  it("classifies a shape named icon_avatar as an avatar regardless of sibling count", () => {
    const avatar = { ...makeVector(25, 28), name: "icon_avatar" };
    expect(classifyVector(avatar, 4).role).toBe("avatar");
  });

  it("does not classify a large shape merely containing 'avatar' in an unrelated way as an avatar", () => {
    const notAvatar = { ...makeVector(400, 300), name: "avatar-bg-illustration" };
    expect(classifyVector(notAvatar, 1).role).toBe("image");
  });
});
