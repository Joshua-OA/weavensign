import { describe, expect, it } from "vitest";
import type { DesignNode, GroupNode } from "@weavensign/schema";
import { classifyContainer } from "./classify-container.js";

function makeGroup(name: string, width: number, height: number, children: DesignNode[] = []): GroupNode {
  return {
    id: `${name}-id`,
    name,
    visible: true,
    locked: false,
    geometry: { position: { x: 0, y: 0 }, size: { width, height }, rotationDegrees: 0 },
    type: "group",
    children,
  };
}

describe("classifyContainer", () => {
  it("classifies a card-shaped container repeated among siblings as a card", () => {
    const siblings = [
      makeGroup("product card", 300, 500),
      makeGroup("product card", 300, 500),
      makeGroup("product card", 300, 500),
    ];
    expect(classifyContainer(siblings[0]!, siblings).role).toBe("card");
  });

  it("classifies a card-shaped container with several children as a card even without repetition", () => {
    const child = makeGroup("child", 10, 10);
    const lone = makeGroup("unique card", 300, 500, [child, child, child]);
    expect(classifyContainer(lone, [lone]).role).toBe("card");
  });

  it("classifies a thin strip container as other, not a card", () => {
    const strip = makeGroup("nav bar", 1512, 40);
    expect(classifyContainer(strip, [strip]).role).toBe("other");
  });
});
