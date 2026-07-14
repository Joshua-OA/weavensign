import { describe, expect, it } from "vitest";
import { formatColor, formatNumber, formatPx } from "./format-value.js";

describe("formatPx", () => {
  it("rounds to 2 decimal places", () => {
    expect(formatPx(39.999999994571226)).toBe("40px");
  });

  it("preserves a value that is already at 2 decimals", () => {
    expect(formatPx(12.34)).toBe("12.34px");
  });

  it("formats a whole number without trailing zeros", () => {
    expect(formatPx(100)).toBe("100px");
  });
});

describe("formatNumber", () => {
  it("rounds to 2 decimal places with no unit suffix", () => {
    expect(formatNumber(45.999999999999)).toBe("46");
  });
});

describe("formatColor", () => {
  it("converts a fully opaque 0-1 color to rgb()", () => {
    expect(formatColor({ r: 1, g: 0, b: 0, a: 1 })).toBe("rgb(255, 0, 0)");
  });

  it("converts a translucent color to rgba() with 2-decimal alpha", () => {
    expect(formatColor({ r: 0, g: 0, b: 1, a: 0.5 })).toBe("rgba(0, 0, 255, 0.5)");
  });

  it("rounds fractional channel values to the nearest integer", () => {
    expect(formatColor({ r: 0.32549020648002625, g: 0.1921568661928177, b: 0.07450980693101883, a: 1 })).toBe(
      "rgb(83, 49, 19)",
    );
  });
});
