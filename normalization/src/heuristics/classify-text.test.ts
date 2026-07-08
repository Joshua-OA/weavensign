import { describe, expect, it } from "vitest";
import type { TextNode } from "@weavensign/schema";
import { classifyText } from "./classify-text.js";

function makeText(characters: string, fontSizePx: number): TextNode {
  return {
    id: "1",
    name: "test",
    visible: true,
    locked: false,
    geometry: { position: { x: 0, y: 0 }, size: { width: 100, height: 20 }, rotationDegrees: 0 },
    type: "text",
    style: { fills: [], strokes: [], effects: [], opacity: 1, blendMode: "normal" },
    content: {
      runs: [
        {
          characters,
          style: {
            fontFamily: "Inter",
            fontWeight: 400,
            fontStyle: "normal",
            fontSizePx,
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

describe("classifyText", () => {
  it("classifies a known button label as a button", () => {
    expect(classifyText(makeText("add to cart", 12)).role).toBe("button");
  });

  it("classifies a known nav label as a nav-item", () => {
    expect(classifyText(makeText("Home", 16)).role).toBe("nav-item");
  });

  it("classifies large short text as a heading", () => {
    expect(classifyText(makeText("NEW ARRIVAL", 32)).role).toBe("heading");
  });

  it("classifies long text as body-text", () => {
    const longText = "The latest sports, women's and many more accessories to complement all your clothing";
    expect(classifyText(makeText(longText, 16)).role).toBe("body-text");
  });

  it("classifies short, non-heading, non-label text as body-text (no badge signal from text alone)", () => {
    expect(classifyText(makeText("ghs 200.00", 14)).role).toBe("body-text");
  });
});
