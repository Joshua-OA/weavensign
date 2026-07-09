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

  it("classifies a small pill with one text label plus a full-width background as a button", () => {
    const label = { ...makeGroup("Text-23", 61, 14), type: "text" } as unknown as DesignNode;
    const background = { ...makeGroup("Rect-9", 140, 42), type: "vector" } as unknown as DesignNode;
    const button = makeGroup("Button-1", 140, 42, [background, label]);
    expect(classifyContainer(button, [button]).role).toBe("button");
  });

  it("classifies a same-size icon+label pair with a narrow icon as other, not a button", () => {
    const label = { ...makeGroup("Account", 63, 19), type: "text" } as unknown as DesignNode;
    const icon = { ...makeGroup("Frame", 28.6, 28.6), type: "vector" } as unknown as DesignNode;
    const pair = makeGroup("Group 10", 97.5, 28.6, [label, icon]);
    expect(classifyContainer(pair, [pair]).role).toBe("other");
  });

  it("classifies a tiny pill with two text runs and a background as a badge", () => {
    const label = { ...makeGroup("label", 29, 14), type: "text" } as unknown as DesignNode;
    const number = { ...makeGroup("number", 13, 14), type: "text" } as unknown as DesignNode;
    const background = { ...makeGroup("bg", 23, 16), type: "vector" } as unknown as DesignNode;
    const stat = makeGroup("stat-1", 57, 16, [label, background, number]);
    expect(classifyContainer(stat, [stat]).role).toBe("badge");
  });

  it("classifies a small all-vector group repeated among same-shape siblings as a nav-item", () => {
    const makeNavIcon = (name: string) => {
      const path = { ...makeGroup(`${name}-path`, 22, 22), type: "vector" } as unknown as DesignNode;
      return makeGroup(name, 22, 22, [path]);
    };
    const siblings = [makeNavIcon("dash"), makeNavIcon("Vector(2)"), makeNavIcon("Vector(3)")];
    expect(classifyContainer(siblings[0]!, siblings).role).toBe("nav-item");
  });

  it("classifies duplicated Penpot-style dash-numbered siblings as a repeated card", () => {
    const siblings = [makeGroup("Component-1", 230, 60), makeGroup("Component-2", 230, 75), makeGroup("Component-3", 230, 60)];
    expect(classifyContainer(siblings[0]!, siblings).role).toBe("card");
  });

  it("does not treat Figma's generic space-numbered default names as a repeat signal", () => {
    const siblings = [makeGroup("Group 15", 60, 40), makeGroup("Group 16", 60, 40), makeGroup("Group 17", 60, 40)];
    expect(classifyContainer(siblings[0]!, siblings).role).toBe("other");
  });

  it("classifies a search-icon-plus-text pair as an input-field", () => {
    const icon = { ...makeGroup("icon_search", 18, 18), type: "vector" } as unknown as DesignNode;
    const text = { ...makeGroup("Text-1", 224, 17), type: "text" } as unknown as DesignNode;
    const search = makeGroup("search", 254, 18, [icon, text]);
    expect(classifyContainer(search, [search]).role).toBe("input-field");
  });

  it("classifies a background-plus-two-text pill in the input-field height band as an input-field", () => {
    const background = { ...makeGroup("bg-3", 315, 40), type: "vector" } as unknown as DesignNode;
    const value = { ...makeGroup("Text-52", 32, 16), type: "text" } as unknown as DesignNode;
    const hint = { ...makeGroup("Text-53", 220, 17), type: "text" } as unknown as DesignNode;
    const field = makeGroup("Group-3", 315, 40, [background, value, hint]);
    expect(classifyContainer(field, [field]).role).toBe("input-field");
  });

  it("does not classify a taller three-child card-shaped container as an input-field", () => {
    const background = { ...makeGroup("bg", 230, 60), type: "vector" } as unknown as DesignNode;
    const title = { ...makeGroup("Text-1", 100, 16), type: "text" } as unknown as DesignNode;
    const body = { ...makeGroup("Text-2", 200, 16), type: "text" } as unknown as DesignNode;
    const card = makeGroup("message-2", 230, 60, [background, title, body]);
    expect(classifyContainer(card, [card]).role).not.toBe("input-field");
  });
});
