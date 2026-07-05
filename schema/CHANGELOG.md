# @weavensign/schema changelog

## Unreleased

- Added `Result<T, E>` (`ok`/`err` helpers) — shared by adapters, normalization, and the
  MCP server for routine, expected failures (context.md §4.6). Additive, non-breaking.

## 0.2.0

Breaking changes surfaced by building the Figma adapter against real REST API responses
(a hand-built schema guessed several of these wrong before any adapter existed):

- `GradientFillSchema.transform` (raw 6-number matrix) replaced with `handles`: three
  control points (`start`, `end`, `widthAxis`) in 0-1 bounding-box space. Neither Figma
  nor Penpot expose a raw affine matrix for gradient placement; both use handle points.
- `ComponentNode.componentKey` renamed to `ComponentNode.key` — this is the component
  definition's own stable cross-file identity (Figma: `key` on the component record).
  `ComponentInstanceNode.componentKey` is unchanged in name but now documented precisely:
  it holds the referenced *definition's* `key`, resolved by the adapter — never the
  source format's node-local reference id (Figma: `componentId`).
- `PositionSchema` doc tightened: position is always parent-relative local space (Figma:
  derived from `relativeTransform`, never `absoluteBoundingBox`, which is page-space and
  would break tree composition on reparenting).

## 0.1.0

Initial canonical schema.

- Node types: `frame`, `group`, `text`, `vector`, `component`, `component-instance`.
- Shared `BaseNode` fields: id, name, visible, locked, geometry, optional provenance.
- Geometry: position, size, rotation, optional affine transform.
- Style: fills (solid/gradient/image), strokes, effects (shadows, blur), opacity, blend mode.
- Typography: run-based text content, per-run character styling.
- Vector: SVG-compatible path data per subpath.
