# @weavensign/adapter-figma

One job: mechanical translation from Figma REST API node JSON into the canonical
`DesignNode` tree defined in `@weavensign/schema`. No inference, no heuristics, no
guessing at semantic role — that's the normalization layer's job, later.

## May import

- `@weavensign/schema`.
- `zod`, for parsing raw API responses at the trust boundary.

## Must never import

- `/normalization`, `/mcp-server`, `/renderers`, or the Penpot adapter. Adapters are
  siblings — they only ever produce the canonical schema, never consume each other.

## How it works

1. `raw-*.ts` files define Zod schemas for the subset of Figma's REST API node JSON this
   adapter actually reads (`GET /v1/files/:key/nodes?ids=...&geometry=paths` — the
   `geometry=paths` query param is required, or `fillGeometry` is omitted and every
   vector/shape node maps to an empty path list).
2. `map-*.ts` files translate each raw shape into its canonical equivalent: geometry,
   paint (fills/strokes/gradients), text runs, and the per-node-type dispatch in
   `map-node.ts`.
3. `parse-figma-nodes.ts` is the public entry point: takes the raw HTTP response body
   (`unknown`) plus the file id and the node ids you requested, returns
   `Result<DesignNode[], ParseFigmaNodesError>`.

Routine failures (a malformed response, a requested node id absent from the response, an
instance whose `componentId` has no matching entry in the `components` map) are `Result`
errors, never thrown — see context.md §4.6.

## Known gaps (not silently guessed at — tracked here until addressed)

- Text nodes with multiple style ranges (`characterStyleOverrides` +
  `styleOverrideTable`) collapse to a single run using the node's top-level `style`.
  Mixed-style text will map incorrectly until per-range styling is added.
- Only FRAME, GROUP, TEXT, COMPONENT, INSTANCE, and the six vector-leaf types (VECTOR,
  RECTANGLE, ELLIPSE, LINE, REGULAR_POLYGON, STAR) are mapped. Any other Figma node type
  (e.g. BOOLEAN_OPERATION, SLICE) is rejected by `RawNodeSchema` at parse time — surfaces
  as an `invalid-response` error, not a silent drop.
- Paint kinds beyond SOLID/gradient*/IMAGE (e.g. Figma's newer video fills) are similarly
  rejected at parse time.

## Fixtures

`fixtures/raw/*.json` are anonymized, hand-trimmed recordings of real Figma REST API
responses (ids and names replaced with generic placeholders; field shapes, value
formats, and rounding are otherwise untouched). `*.components.json` files are the paired
file-scoped `components` map entries needed to resolve component-instance references.
Tests never make live Figma API calls — see context.md §4.8.
