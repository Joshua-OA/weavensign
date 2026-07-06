import { describe, expect, it } from "vitest";
import { mapTextContent } from "./map-text.js";
import type { RawTextStyle } from "./raw-text.js";

function baseStyle(overrides: Partial<RawTextStyle> = {}): RawTextStyle {
  return {
    fontFamily: "Inter",
    fontWeight: 400,
    fontSize: 14,
    textAlignHorizontal: "LEFT",
    letterSpacing: 0,
    lineHeightPx: 17,
    ...overrides,
  };
}

describe("mapTextContent", () => {
  it("defaults textDecoration/textCase to none when Figma omits them (the default-value case)", () => {
    const content = mapTextContent("hi", baseStyle());
    expect(content.runs[0]?.style.textDecoration).toBe("none");
    expect(content.runs[0]?.style.textCase).toBe("none");
  });

  it("maps a real UNDERLINE textDecoration instead of defaulting to none", () => {
    const content = mapTextContent("hi", baseStyle({ textDecoration: "UNDERLINE" }));
    expect(content.runs[0]?.style.textDecoration).toBe("underline");
  });

  it("maps a real STRIKETHROUGH textDecoration", () => {
    const content = mapTextContent("hi", baseStyle({ textDecoration: "STRIKETHROUGH" }));
    expect(content.runs[0]?.style.textDecoration).toBe("strikethrough");
  });

  it("maps a real UPPER textCase instead of defaulting to none", () => {
    const content = mapTextContent("hi", baseStyle({ textCase: "UPPER" }));
    expect(content.runs[0]?.style.textCase).toBe("upper");
  });

  it("maps TITLE and LOWER textCase", () => {
    expect(mapTextContent("hi", baseStyle({ textCase: "TITLE" })).runs[0]?.style.textCase).toBe("title");
    expect(mapTextContent("hi", baseStyle({ textCase: "LOWER" })).runs[0]?.style.textCase).toBe("lower");
  });
});
