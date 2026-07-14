# @weavensign/renderer-shared

One job: format-agnostic mapping from a `DesignNode`'s `Geometry`/`Style`/`TextContent`
into a list of `{ prop, value }` CSS declarations, plus deterministic number/color
formatting. Every declaration value is a valid CSS-syntax string (`"12px"`,
`"rgb(255, 0, 0)"`) — this makes the output directly usable both as a CSS stylesheet rule
(`@weavensign/renderer-html-css`) and as a React inline `style={{...}}` object value
(`@weavensign/renderer-jsx-tsx`), without either renderer needing its own copy of the
rounding/declaration rules.

Extracted from `@weavensign/renderer-html-css` once a second renderer (`jsx-tsx`) needed
the exact same logic — context.md §4.5's "don't duplicate the same job" rule applies to
in-house code, not just third-party dependencies: two renderers hand-maintaining their own
copy of geometry/style-to-declarations mapping would risk silent drift (e.g. a rounding
precision change applied to one but not the other).

## May import

- `@weavensign/schema`.

## Must never import

- `/adapters/*`, `/normalization`, `/mcp-server`, or either renderer package. This
  package has no opinion about output format (HTML, JSX, or anything else) — it only
  knows how to turn schema data into declaration data.

## How it works

- `format-value.ts` — the only place numeric/color rounding happens (`formatPx`,
  `formatNumber`, `formatColor`). Real design-tool data carries float noise (e.g.
  `39.999999994571226px`, see learning_v0.md #023); output is rounded to a fixed,
  deterministic precision (2 decimals for pixels/numbers, 0-255 integers for color
  channels) rather than re-exposing upstream float drift.
- `css-declarations.ts` — `geometryDeclarations`, `textDeclarations`,
  `styleDeclarations`. Every node is absolutely positioned within its parent's local box
  per `PositionSchema`'s parent-relative convention; `position: absolute` on a node's own
  declarations also establishes the positioned-ancestor context its children resolve
  against, so no separate `position: relative` declaration is ever needed (a bug caught
  and fixed in `renderer-html-css`'s first pass, see learning_v0.md #030). Only fills/
  gaps with real fixture data behind them are mapped — gradient fills and two of four
  `autoResize` values have zero real examples in the eval set and are left unmapped
  rather than guessed at (context.md §7, learning_v0.md #031).

## Testing

Direct unit tests (`format-value.test.ts`, `css-declarations.test.ts`) — this logic used
to only be covered indirectly through `renderer-html-css`'s golden-file tests, which
meant `renderer-jsx-tsx` would have had zero coverage of the shared logic it depends on
just as much. Extracting the package was also the trigger to close that gap.

## Fixtures

`fixtures/*.json` — real, schema-valid `DesignNode[]` trees, built from real nodes
pulled from `/eval/fixtures` (see each fixture's originating node id in
`renderer-html-css`'s and `renderer-jsx-tsx`'s learning_v0.md entries). Live here, not in
either renderer package, because both renderers test against the exact same inputs —
each renderer keeps its own `golden/` output next to its own tests, but the input data
is one shared source, not two copies to keep in sync by hand.
