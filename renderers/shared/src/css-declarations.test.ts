import type { Geometry, Style } from "@weavensign/schema";
import { describe, expect, it } from "vitest";
import { geometryDeclarations, styleDeclarations, textDeclarations } from "./css-declarations.js";

function makeGeometry(overrides: Partial<Geometry> = {}): Geometry {
  return {
    position: { x: 10, y: 20 },
    size: { width: 100, height: 50 },
    rotationDegrees: 0,
    ...overrides,
  };
}

function makeStyle(overrides: Partial<Style> = {}): Style {
  return {
    fills: [],
    strokes: [],
    effects: [],
    opacity: 1,
    blendMode: "normal",
    ...overrides,
  };
}

function findDeclaration(declarations: { prop: string; value: string }[], prop: string): string | undefined {
  return declarations.find((declaration) => declaration.prop === prop)?.value;
}

describe("geometryDeclarations", () => {
  it("always positions absolute with left/top/width/height from the geometry", () => {
    const declarations = geometryDeclarations(makeGeometry());
    expect(findDeclaration(declarations, "position")).toBe("absolute");
    expect(findDeclaration(declarations, "left")).toBe("10px");
    expect(findDeclaration(declarations, "top")).toBe("20px");
    expect(findDeclaration(declarations, "width")).toBe("100px");
    expect(findDeclaration(declarations, "height")).toBe("50px");
  });

  it("omits transform when rotation is 0", () => {
    const declarations = geometryDeclarations(makeGeometry({ rotationDegrees: 0 }));
    expect(findDeclaration(declarations, "transform")).toBeUndefined();
  });

  it("adds a rotate() transform when rotation is non-zero", () => {
    const declarations = geometryDeclarations(makeGeometry({ rotationDegrees: 45 }));
    expect(findDeclaration(declarations, "transform")).toBe("rotate(45deg)");
  });
});

describe("textDeclarations", () => {
  it("keeps fixed pixel width/height for autoResize 'none'", () => {
    const declarations = textDeclarations(makeGeometry(), "left", "none");
    expect(findDeclaration(declarations, "width")).toBe("100px");
    expect(findDeclaration(declarations, "height")).toBe("50px");
  });

  it("replaces width/height with 'auto' for autoResize 'width-and-height'", () => {
    const declarations = textDeclarations(makeGeometry(), "left", "width-and-height");
    expect(findDeclaration(declarations, "width")).toBe("auto");
    expect(findDeclaration(declarations, "height")).toBe("auto");
  });

  it("always includes text-align from the given value", () => {
    const declarations = textDeclarations(makeGeometry(), "center", "none");
    expect(findDeclaration(declarations, "text-align")).toBe("center");
  });
});

describe("styleDeclarations", () => {
  it("maps a solid fill to background-color", () => {
    const declarations = styleDeclarations(makeStyle({ fills: [{ type: "solid", color: { r: 1, g: 1, b: 1, a: 1 } }] }));
    expect(findDeclaration(declarations, "background-color")).toBe("rgb(255, 255, 255)");
  });

  it("renders a striped placeholder for an image-only fill, not a background-color", () => {
    const declarations = styleDeclarations(makeStyle({ fills: [{ type: "image", assetRef: "abc", scaleMode: "fill" }] }));
    expect(findDeclaration(declarations, "background-color")).toBe("rgb(229, 229, 229)");
    expect(findDeclaration(declarations, "background-image")).toContain("repeating-linear-gradient");
  });

  it("prefers a solid fill over an image fill when both are present", () => {
    const declarations = styleDeclarations(
      makeStyle({
        fills: [
          { type: "image", assetRef: "abc", scaleMode: "fill" },
          { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
        ],
      }),
    );
    expect(findDeclaration(declarations, "background-color")).toBe("rgb(0, 0, 0)");
    expect(findDeclaration(declarations, "background-image")).toBeUndefined();
  });

  it("renders no fill declarations when only a gradient fill is present (no real fixture data to build a shape from)", () => {
    const declarations = styleDeclarations(
      makeStyle({
        fills: [
          {
            type: "gradient",
            gradientKind: "linear",
            stops: [
              { position: 0, color: { r: 1, g: 1, b: 1, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
            ],
            handles: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, widthAxis: { x: 0, y: 1 } },
          },
        ],
      }),
    );
    expect(findDeclaration(declarations, "background-color")).toBeUndefined();
    expect(findDeclaration(declarations, "background-image")).toBeUndefined();
  });

  it("maps a solid stroke to border", () => {
    const declarations = styleDeclarations(
      makeStyle({ strokes: [{ fill: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } }, weight: 2, align: "center" }] }),
    );
    expect(findDeclaration(declarations, "border")).toBe("2px solid rgb(0, 0, 0)");
  });

  it("omits opacity when it's the default 1", () => {
    const declarations = styleDeclarations(makeStyle({ opacity: 1 }));
    expect(findDeclaration(declarations, "opacity")).toBeUndefined();
  });

  it("includes opacity when non-default", () => {
    const declarations = styleDeclarations(makeStyle({ opacity: 0.5 }));
    expect(findDeclaration(declarations, "opacity")).toBe("0.5");
  });

  it("maps cornerRadius to border-radius", () => {
    const declarations = styleDeclarations(makeStyle({ cornerRadius: 8 }));
    expect(findDeclaration(declarations, "border-radius")).toBe("8px");
  });

  it("omits mix-blend-mode for the default 'normal'", () => {
    const declarations = styleDeclarations(makeStyle({ blendMode: "normal" }));
    expect(findDeclaration(declarations, "mix-blend-mode")).toBeUndefined();
  });

  it("maps drop-shadow effects to box-shadow", () => {
    const declarations = styleDeclarations(
      makeStyle({
        effects: [{ type: "drop-shadow", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, blur: 8, spread: 0 }],
      }),
    );
    expect(findDeclaration(declarations, "box-shadow")).toBe("0px 4px 8px 0px rgba(0, 0, 0, 0.25)");
  });
});
