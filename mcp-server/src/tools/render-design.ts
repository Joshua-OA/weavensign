import { renderDocument as renderHtmlCss } from "@weavensign/renderer-html-css";
import { renderComponent as renderJsxTsx } from "@weavensign/renderer-jsx-tsx";
import { renderDocument as renderSvg } from "@weavensign/renderer-svg";
import { DesignNodeSchema } from "@weavensign/schema";
import { z } from "zod";
import { textToolResult, type ToolResult } from "./tool-result.js";

const RENDER_FORMATS = ["html-css", "jsx-tsx", "svg"] as const;
type RenderFormat = (typeof RENDER_FORMATS)[number];

export const RENDER_DESIGN_INPUT_SHAPE = {
  nodes: z.array(DesignNodeSchema).describe("Top-level DesignNode array, as returned by get_figma_design/get_penpot_page"),
  format: z.enum(RENDER_FORMATS).describe("Output format: \"html-css\" (HTML + inline CSS), \"jsx-tsx\" (a single React function component), or \"svg\" (a single SVG document)"),
};

const RenderDesignInputSchema = z.object(RENDER_DESIGN_INPUT_SHAPE);
export type RenderDesignInput = z.infer<typeof RenderDesignInputSchema>;

async function render(nodes: RenderDesignInput["nodes"], format: RenderFormat): Promise<string> {
  switch (format) {
    case "html-css":
      return renderHtmlCss(nodes);
    case "jsx-tsx":
      return renderJsxTsx(nodes);
    case "svg":
      return renderSvg(nodes);
  }
}

/**
 * Renders a DesignNode tree (as returned by get_figma_design/get_penpot_page, optionally
 * annotated via classify_roles first) into real source: HTML+CSS, a JSX/TSX React
 * component, or an SVG document. Returns the rendered source as plain text, not JSON —
 * callers write it straight to a file rather than parsing it as data.
 */
export async function renderDesign(input: RenderDesignInput): Promise<ToolResult> {
  const source = await render(input.nodes, input.format);
  return textToolResult(source);
}
