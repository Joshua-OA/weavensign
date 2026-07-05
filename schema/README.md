# @weavensign/schema

One job: define the canonical Design DOM — the discriminated-union node types and their
Zod validators that every adapter, the normalization layer, the MCP server, and every
renderer read and write. This is the only shared vocabulary in the project; nothing else
may define its own competing node shape.

## May import

- `zod` only. No other runtime dependency.

## Must never import

- Anything from `/adapters`, `/normalization`, `/mcp-server`, or `/renderers`. Schema is
  the root of the dependency graph — it depends on nothing else in this repo.

## Layout

- `geometry.ts` — position/size/rotation/transform.
- `style.ts` — fills, strokes, effects, opacity, blend mode.
- `typography.ts` — text run styling and content.
- `vector-path.ts` — SVG-compatible path data.
- `node-base.ts` — fields shared by every node, plus adapter provenance.
- `nodes.ts` — the `DesignNode` discriminated union and its Zod schema.
- `assert-never.ts` — exhaustiveness helper for `switch (node.type)`.
- `result.ts` — shared `Result<T, E>` for routine/expected failures (§4.6), used by every
  downstream module (adapters, normalization, MCP server).
- `version.ts` — `SCHEMA_VERSION`; see `CHANGELOG.md` for breaking changes.

## Adding a node type or field

1. Extend the type/schema in `nodes.ts` (or the relevant shared file).
2. Add a fixture + validator test in `src/*.test.ts`.
3. Bump `SCHEMA_VERSION` if the change is breaking (removes a field, narrows a type,
   changes a discriminant) and record it in `CHANGELOG.md`.
