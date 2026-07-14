# @weavensign/renderer-html-css

One job: deterministic, pure translation from a canonical `DesignNode[]` tree into a
self-contained HTML/CSS document string. No AI, no inference — that already happened in
the normalization layer, if at all. Same input always produces the same output, byte for
byte (context.md §4.7).

## May import

- `@weavensign/schema`.
- `@weavensign/renderer-shared`, for the format-agnostic `Geometry`/`Style` → CSS
  declaration mapping shared with `renderer-jsx-tsx` (extracted once a second renderer
  needed the exact same logic — see that package's README).
- `postcss`, for building CSS output as an AST rather than string concatenation, so
  output is always syntactically valid.

## Must never import

- `/adapters/*`, `/normalization`, `/mcp-server`, or `renderer-jsx-tsx`. Renderers
  consume the canonical schema only — they don't know or care where the tree came from,
  and don't need role labels to produce structurally correct output (role-aware
  rendering, if ever added, is a separate concern from this package's "make the pixels
  match" job). Sibling renderers never import each other directly, only through
  `renderer-shared`.

## How it works

- `render-document.ts` — public entry point. `renderDocument(roots: DesignNode[]): string`
  walks the tree once, returns one complete `<!DOCTYPE html>` document with an inline
  `<style>` block.
- `render-node.ts` — per-node-type dispatch via `switch` + `assertNever` (context.md
  §4.1). Every node becomes one absolutely-positioned `<div>`; `position: absolute` on a
  node's own rule is what establishes the positioned-ancestor context its children's
  `left`/`top` resolve against, so no node ever needs a separate `position: relative`
  declaration (a mistake caught during this package's first pass — see learning_v0.md).
- `@weavensign/renderer-shared`'s `css-declarations.ts` — `Geometry`/`Style` → CSS
  declaration list (plain data, not strings yet). Lives in the shared package now, not
  here.
- `stringify-css.ts` — declaration list → a CSS rule string, via postcss's AST with
  explicit `raws` so whitespace/semicolon output is pinned, not left to postcss's
  defaults (a transitive version bump silently changing generated output would be a
  determinism bug, not a minor version bump — context.md §4.5).
- `render-svg-vector.ts` — a `VectorNode`'s `paths` (SVG path-data strings already, per
  the schema) become an inline `<svg>`, since HTML/CSS has no native way to paint
  arbitrary path geometry.
- `render-text.ts` — a `TextNode`'s `content.runs` become one `<span>` per run, each
  carrying its own inline style — a direct mapping, since a `TextRun` is already defined
  as "contiguous characters sharing one style." `renderer-shared`'s `textDeclarations`
  handles the node-level box: `width-and-height` autoResize (hug contents) gets
  `width: auto; height: auto` instead of the source's fixed pixel box, so it doesn't
  fight the browser's own text layout.

## Testing

- `fixtures/*.json` — real, schema-valid `DesignNode[]` trees (validated against
  `DesignNodeSchema` in the test itself, not assumed).
- `golden/*.html` — the exact expected output for each fixture. A diff here requires an
  explicit, reviewed update to the golden file, never a silent overwrite (context.md
  §4.8).
- `render-document.test.ts` also asserts determinism directly (render the same fixture
  twice, expect byte-identical output) per §4.7 — not just a normal correctness check.
- `scripts/smoke-render.ts` (`npx tsx renderers/html-css/scripts/smoke-render.ts`) runs
  the renderer against every real fixture in `/eval/fixtures` — not golden-file tested
  (too large to review byte-for-byte), just checked for crashes, balanced HTML tags, no
  literal `undefined`/`NaN` leaking into output, and render time. Same "survive contact
  with real, previously-unexercised data" check the adapter sessions ran before calling
  an adapter done (learning_v0.md #011/#012). Not part of `npm test`; a manual
  verification tool, same pattern as `eval/run-heuristic.ts`.

## Known gaps

- Solid fills/strokes map directly to CSS. Image fills (`ImageFillSchema`) render as a
  visible striped placeholder, not the real image — `assetRef` is Figma's opaque
  internal image hash, and no asset-resolution layer exists anywhere in this project yet
  to turn it into a fetchable URL, so a real `<img src>` isn't possible without that
  layer being built first (a bigger, separate scope than this renderer). Gradient fills
  (`GradientFillSchema`) have zero real examples in any eval fixture so far — per
  context.md §7's rule against building from a guess when no real data exists to check
  it against, they're left unrendered until a real one shows up.
- Text auto-resize: `none` (fixed box) and `width-and-height` (hug contents, both
  dimensions) are mapped — both have real fixture coverage. `height` and `truncate` have
  zero real examples in any eval fixture and are left unmapped for the same reason as
  gradients above.
- `ComponentNode`/`ComponentInstanceNode` render identically to `frame`/`group` — no
  distinction is made between a component definition and an instance's overrides yet.
