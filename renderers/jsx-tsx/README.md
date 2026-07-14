# @weavensign/renderer-jsx-tsx

One job: deterministic, pure translation from a canonical `DesignNode[]` tree into a
self-contained React (TSX) function component. No AI, no inference — same rule as
`@weavensign/renderer-html-css`. Same input always produces the same output, byte for
byte (context.md §4.7).

## May import

- `@weavensign/schema`.
- `@weavensign/renderer-shared`, for the same format-agnostic `Geometry`/`Style` → CSS
  declaration mapping `renderer-html-css` uses — every declaration value is already a
  valid CSS-syntax string, which React's inline `style={{...}}` accepts directly, so
  this renderer reuses the exact same declarations, just serialized into a JS object
  expression instead of a CSS rule string.
- `@babel/types` + `@babel/generator`, for building and printing the component as a real
  AST (not string templates) — output is always syntactically valid JSX, per context.md
  §3. Pinned to the 7.x line, not 8.x — Babel 8's latest packages require a newer Node
  than this repo's `engines.node: ">=20"` commitment (confirmed via a real EBADENGINE
  warning on install); 7.29.7 has the identical builder API for everything this renderer
  needs and imposes no such floor.
- `prettier`, for formatting the generated code.

## Must never import

- `/adapters/*`, `/normalization`, `/mcp-server`, or `renderer-html-css`. Sibling
  renderers never import each other directly, only through `renderer-shared` — same rule
  as that package's README states from the other side.

## How it works

- `render-component.ts` — public entry point. `renderComponent(roots: DesignNode[]):
  Promise<string>` builds one Babel `Program` AST (one function component,
  `GeneratedDesign`, wrapping the whole tree — not one component per container node; see
  the doc comment on `buildComponentAst` for why that narrower scope was chosen),
  generates code from it, and formats it with Prettier. Async because Prettier's
  `format()` is async in v3; everything upstream of that call is synchronous and pure.
- `render-node.ts` — per-node-type dispatch via `switch` + `assertNever` (context.md
  §4.1), building JSX AST nodes instead of the HTML string templates
  `renderer-html-css` builds. Same `position: absolute`-only composition strategy (see
  that package's README and learning_v0.md #030 for why no `position: relative` is ever
  needed).
- `render-svg-vector.ts` — a `VectorNode`'s `paths` become a real JSX `<svg>` element
  (AST nodes, not a template string) — same reasoning as `renderer-html-css`'s version:
  JSX has no native way to paint arbitrary path geometry.
- `render-text.ts` — a `TextNode`'s `content.runs` become one `<span>` per run.
  **Text content is wrapped as a JS string literal inside a `{}` expression container,
  not raw JSX text** — a bare `<` inside JSXText breaks parsing entirely, which crashed
  this renderer's own golden-fixture generation on a real "Hello & \<world\>" string
  before this fix (see the doc comment on `renderRunSpan` and learning_v0.md).
- `style-object.ts` — converts a `CssDeclaration[]` into a Babel `ObjectExpression` for a
  `style={{...}}` attribute, translating each kebab-case CSS property name to the
  camelCase key React expects.

## Testing

- Fixtures live in `@weavensign/renderer-shared/fixtures` (shared with
  `renderer-html-css` — see that package's README for why), not duplicated here.
- `golden/*.tsx` — the exact expected output for each fixture, same "explicit reviewed
  update only" rule as the HTML renderer (context.md §4.8).
- `render-component.test.ts` asserts determinism directly (render twice, byte-identical)
  per §4.7. Deliberately does *not* separately test "is the output syntactically valid
  TSX" — Prettier's own `format()` call already re-parses the generated code before
  printing it, so a successful `renderComponent()` call is already independent proof of
  syntactic validity; a second, heavier parse (e.g. via the TypeScript compiler) would
  only duplicate that check.
- `scripts/smoke-render.ts` (`npx tsx renderers/jsx-tsx/scripts/smoke-render.ts`) runs
  the renderer against every real fixture in `/eval/fixtures`, mirroring
  `renderer-html-css`'s smoke test.

## Known gaps

Same three as `renderer-html-css`, inherited from the same missing-data/missing-
infrastructure reasons (see that package's README for the full explanation, and
learning_v0.md #031 for why they weren't guessed at instead):

- Gradient fills unrendered (zero real fixture examples).
- Image fills render a striped placeholder, not the real asset (no asset-resolution
  layer exists anywhere in the project).
- Text `autoResize` values `height`/`truncate` unmapped (zero real fixture examples).
- `ComponentNode`/`ComponentInstanceNode` render identically to `frame`/`group` — no
  distinction made between a component definition and an instance's overrides.
