# @weavensign/adapter-penpot

One job: mechanical translation from Penpot's API shape graph into the canonical
`DesignNode` tree defined in `@weavensign/schema`. No inference, no heuristics — that's
the normalization layer's job, later.

## May import

- `@weavensign/schema`.
- `zod`, for parsing raw API responses at the trust boundary.

## Must never import

- `/normalization`, `/mcp-server`, `/renderers`, or the Figma adapter. Adapters are
  siblings — they only ever produce the canonical schema, never consume each other.

## How Penpot's data model differs from Figma's (why this isn't a copy-paste of the Figma adapter)

- **Flat graph, not a nested tree.** A Penpot page's `objects` is an id-keyed map; every
  shape (including deeply nested ones) is a sibling entry, linked by `parentId` and (for
  containers) a `shapes` array of child ids. `parse-penpot-page.ts` reconstructs the tree
  by walking from the synthetic root frame (id `00000000-0000-0000-0000-000000000000`)
  down through `shapes` arrays — Figma's adapter never needed this step, since Figma's
  JSON is already nested.
- **Absolute, not parent-relative, position.** Penpot shapes carry page-absolute `x`/`y`;
  there's no field equivalent to Figma's `relativeTransform`. `map-geometry.ts` computes
  canonical (parent-relative) position by subtracting the resolved parent's absolute box.
- **Colors are hex strings** (`fillColor: "#c9cfd9"`, `fillOpacity: 1`), not Figma's
  inline r/g/b/a floats. `map-paint.ts` parses hex at mapping time.
- **No separate INSTANCE node type.** A Penpot component instance is a `frame` shape with
  `componentId` + `componentRoot: true` set. `map-node.ts` checks for that combination
  rather than switching on a distinct type value.
- **`rect` and `circle` don't carry path data.** Only Penpot's `path` type has a `content`
  path string; rect/circle only have box + corner-radius fields. Canonical `VectorNode`
  requires at least one path, so `synthesize-path.ts` generates the outline geometrically
  (a standard 4-curve bezier approximation for circles, an optionally-rounded rectangle
  path for rects) rather than leaving it empty.
- **Text content is a small rich-text tree** (`root -> paragraph-set -> paragraph ->
  text leaves`), not Figma's flat `characters` + single `style`. `map-text.ts` flattens
  every leaf across every paragraph into canonical runs.

## Known gaps (tracked here, not silently guessed at)

- Flattening the paragraph tree loses paragraph-break information — canonical
  `TextContent` has no paragraph/line-break field yet.
- Component instances are only resolved within the same file. Penpot supports
  cross-library component references (`componentFile` pointing at a different file);
  this adapter doesn't fetch or resolve those yet — an out-of-file `componentId` surfaces
  as an `unresolved-component-reference` error, not a silent guess.
- Per-corner rectangle radii (Penpot's `r1`-`r4`) aren't mapped; only the uniform `rx` is
  used by `synthesizeRectPath`.
- `bool` (boolean-combined) shapes map to canonical `vector`, using the same flattened
  `content` SVG path Penpot already computes — the same treatment as `path` shapes. The
  `boolType` (union/subtract/intersect/exclude) and the `shapes` array of source shape ids
  that produced it are not read; they're construction-time provenance, not needed to
  reproduce the rendered result.

## Fixtures

`fixtures/raw/page-with-shapes.json` is a hand-trimmed, anonymized page assembled from
real Penpot API response shapes (fetched via `POST /api/rpc/command/get-file` with
`Accept: application/json`, which returns plain camelCase JSON instead of Penpot's native
Transit-JSON wire format). `page-with-shapes.components.json` is the paired component
definition metadata. Tests never make live Penpot API calls — see context.md §4.8.
