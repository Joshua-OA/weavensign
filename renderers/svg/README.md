# @weavensign/renderer-svg

One job: deterministic, pure translation from a canonical `DesignNode[]` tree into a
self-contained SVG document string. No AI, no inference — same rule as the other two
renderers. Same input always produces the same output, byte for byte (context.md §4.7).

## May import

- `@weavensign/schema`.
- `@weavensign/renderer-shared`, but only `format-value.ts`'s `formatColor`/
  `formatNumber` — SVG's presentation-attribute model (`fill`, `stroke`, `rx`) has no
  overlap with `css-declarations.ts`'s CSS-shaped output (`background-color`, `border`,
  `border-radius`), so this package writes its own `svg-attributes.ts` rather than
  reusing that function.
- `svgo`, for the cleanup/optimization pass named in context.md §3 ("SVG: string/XML
  build, then svgo as a cleanup pass"). Pinned to an exact version — a transitive patch
  release changing which optimizations svgo applies by default would be a determinism
  bug, same rule §4.5 already applies to postcss/babel/prettier in the other renderers.

## Must never import

- `/adapters/*`, `/normalization`, `/mcp-server`, or the other two renderer packages.
  Sibling renderers never import each other directly, only through `renderer-shared`.

## How it works

SVG has no `position: absolute` equivalent — its native coordinate model is nesting plus
`transform="translate(x, y)"`, which maps directly onto `PositionSchema`'s
parent-relative convention without needing the "does a node's own rule also establish a
positioning context for its children" reasoning the HTML/JSX renderers need (see
learning_v0.md #030). Because of that, and because SVG's fill/stroke are attributes on
shapes, not CSS box-model properties, this renderer's mapping is written from scratch per
element rather than reusing `renderer-shared`'s CSS-declaration functions:

- `render-document.ts` — public entry point. `renderDocument(roots: DesignNode[]): string`
  computes a document `viewBox` from the roots' own bounding boxes, walks the tree once,
  and pipes the result through `svgo.optimize()`.
- `render-node.ts` — per-node-type dispatch via `switch` + `assertNever` (context.md
  §4.1). Frame/group/component/component-instance become a `<g transform="translate(...)">`
  wrapping an optional background `<rect>` (SVG's `<g>` itself has no fill; a container's
  own fill needs an explicit shape) plus its rendered children.
- `render-vector.ts` — a `VectorNode`'s `paths` become `<path>` elements directly (they're
  already SVG path-data strings, per the schema) inside a translated `<g>`.
- `render-text.ts` — a `TextNode`'s runs become one `<text>` with a `<tspan>` per run.
  **SVG's `<text y>` is baseline-anchored, not box-top-anchored like the schema's
  geometry** — there is no real font-metrics data in the schema (no ascent/descent
  field) to compute an exact baseline offset, so `y` is approximated as
  `fontSizePx * 0.8` (documented in `BASELINE_RATIO`'s doc comment as an approximation,
  not a precise value). `TextContent.autoResize`'s `width-and-height` (hug contents) has
  no SVG equivalent either — unlike the HTML/JSX renderers' `width: auto`, an SVG
  `viewBox` can't dynamically size to rendered text without a layout engine, so this
  renderer falls back to the schema's stated fixed geometry for every text node
  regardless of `autoResize`, a real, documented behavioral difference from the other two
  renderers, not an oversight.
- `svg-attributes.ts` — `Style` → SVG presentation attributes. Same fill-priority and
  known-gap rules as the other renderers (gradient fills unmapped, image fills get a
  placeholder — here a flat `#e5e5e5` fill, since SVG has no `repeating-linear-gradient`
  shorthand the way CSS does; a striped placeholder would need a `<pattern>` def, out of
  scope for a "can't resolve this asset yet" stand-in). One SVG-specific correctness
  detail: SVG's `fill` initial value is *black*, not transparent like CSS
  `background-color` — a node with no fill at all gets an explicit `fill="none"`, not an
  omitted attribute, or every unfilled shape would render solid black.
- `escape-xml.ts` — XML text/attribute escaping (`&`, `<`, `>`, `"`) — a different rule
  set than HTML's (SVG is XML, stricter about what's allowed unescaped in text content).

## Testing

- Fixtures live in `@weavensign/renderer-shared/fixtures` (shared with the other two
  renderers).
- `golden/*.svg` — the exact expected output for each fixture, same "explicit reviewed
  update only" rule as the other renderers (context.md §4.8).
- `render-document.test.ts` asserts determinism directly (render twice, byte-identical)
  per §4.7.
- `scripts/smoke-render.ts` (`npx tsx renderers/svg/scripts/smoke-render.ts`) runs the
  renderer against every real fixture in `/eval/fixtures`, mirroring the other two
  renderers' smoke tests.

## Known gaps

Three shared with the other renderers (gradient fills, image-fill asset resolution,
component-instance override rendering — see their READMEs and learning_v0.md #031 for
why), plus two specific to this renderer:

- Text baseline position is an approximation (`fontSizePx * 0.8`), not derived from real
  font metrics — the schema has no ascent/descent/baseline field to compute one exactly.
- `TextContent.autoResize` is entirely unmapped (not even the `none`/`width-and-height`
  split the HTML/JSX renderers have) — SVG's `viewBox` can't size to rendered text
  content the way a CSS box can, so every text node uses its fixed source geometry
  regardless of the `autoResize` value.
