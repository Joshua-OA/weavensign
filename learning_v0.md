# learning_v0.md — weavensign build log

Running log of bugs hit and improvements made while building this project. Appended to,
never rewritten — each entry is dated and numbered. Purpose: a persistent record of
*why* something is the way it is, for whoever (human or agent) picks this up later.

---

## 2026-07-05

### 001 — Schema v0.1.0 guessed several Figma field shapes wrong

**What happened:** Built the canonical schema (Step 1) before pulling any real Figma API
data. Guessed `GradientFillSchema` used a raw 6-number affine matrix, guessed component
key/reference used one shared `componentKey` field name, under-documented that
`position` must be parent-relative (not page-absolute).

**How found:** Started the Figma adapter (Step 2), pulled real REST API responses via a
personal access token, and every one of those guesses was wrong on contact with real data.

**Fix:** Bumped schema to 0.2.0. Gradients now use `handles` (start/end/widthAxis control
points — matches how Figma *and* Penpot actually represent gradient placement, neither
exposes a raw matrix). `ComponentNode.key` (definition's stable identity) split from
`ComponentInstanceNode.componentKey` (resolved reference to that key). `PositionSchema`
doc comment now states explicitly: derive from `relativeTransform`, never
`absoluteBoundingBox`.

**Lesson:** Don't guess external API shapes into the schema from memory/spec-reading
alone when real API access is available. Pull one real sample per node type *before*
finalizing schema fields that model an external format, even at Step 1. A hand-built
schema is a hypothesis until it's touched real data once.

### 002 — Figma MCP tools (`get_design_context`, `get_metadata`) are not the REST API

**What happened:** First attempt to get "real Figma data" used the Figma MCP connector's
`get_design_context` tool. It returns generated React+Tailwind JSX and a simplified
XML-outline (`get_metadata`) — not the actual REST API node JSON (fills arrays, stroke
objects, style objects). Building the adapter against that would have baked in wrong
field names for a "Figma REST API adapter."

**Fix:** Got a personal access token from the user, called `api.figma.com/v1/files/:key/nodes`
directly via curl. That's the real, documented, versioned shape the adapter contract
(context.md §2: "Figma adapter... Figma REST API → schema") actually names.

**Lesson:** MCP connector tools built for a different purpose (design-context-for-coding)
are not a substitute for the actual API being adapted. When the task is "build an adapter
for API X," get API X's real response shape, not a derived/simplified view of it another
tool produces for a different consumer.

### 003 — Zod recursive discriminated unions: `z.lazy` + `z.ZodType<T>` annotation traps

**What happened:** `DesignNode` (and later `RawNode`) are recursive via `children`.
Several attempts to type this with `z.lazy(() => z.discriminatedUnion(...))` wrapped
around *every* node schema failed to typecheck — `z.discriminatedUnion` requires
`ZodObject` members, not `ZodType`-erased ones, and hand-written interface annotations on
each leaf schema fought Zod's own default-value input/output type split
(`exactOptionalPropertyTypes: true` makes this worse — Zod's `.optional()` output differs
from a hand-written `field?: T`).

**Fix (the pattern that works):** Keep every leaf node schema a plain `z.object({...})` —
no `z.lazy`, no `z.ZodType<T>` annotation on them. Only wrap the **recursive field itself**
(`children: childrenSchema()`, where `childrenSchema()` returns
`z.lazy(() => z.array(DesignNodeSchema))` cast via `z.ZodType<DesignNode[], z.ZodTypeDef, unknown>`).
Only the top-level union (`DesignNodeSchema`) needs the lazy + 3-arg `ZodType` annotation.
Any hand-written optional field in a type that mirrors Zod output must write
`field?: T | undefined` explicitly, not just `field?: T`, under `exactOptionalPropertyTypes`.

**Lesson:** This is now the house pattern for any future recursive Zod schema (Penpot
adapter will need the same trick). Don't re-derive it from scratch — copy the pattern
from `schema/src/nodes.ts` or `adapters/figma/src/raw-node.ts`.

### 004 — Prefer `switch` + `assertNever` over runtime type-guard functions for exhaustiveness

**What happened:** First draft of `map-node.ts` used an `if (node.type === "X")` chain
ending in a helper `isVectorLeafType()` function (a runtime `.includes()` check) before
falling through to `assertNever`. TS couldn't prove that branch unreachable through the
runtime guard, forcing an `as never` cast to silence the compiler — technically safe, but
exactly the kind of assertion context.md §4.1 requires special justification for.

**Fix:** Rewrote as a real `switch (node.type) { case "A": ... default: return assertNever(node) }`.
TS narrows exhaustively through literal-type switch cases without any cast needed.

**Lesson:** When every case is a literal string discriminant, always reach for `switch`
over `if`-chains + a runtime type-guard helper — the switch gives real compiler-verified
exhaustiveness for free, the if-chain doesn't.

### 005 — Package version vs. schema-content version are two different numbers

**What happened:** Bumped the *content* version constant `SCHEMA_VERSION` (in
`version.ts`) to `"0.2.0"` but forgot to bump `schema/package.json`'s own `"version"`
field to match. The adapter's `package.json` depended on `@weavensign/schema: "0.2.0"`,
and `npm install` failed with a 404 (npm tried the public registry since the local
workspace version didn't match the requested one).

**Fix:** Keep `package.json` version and `SCHEMA_VERSION` in lockstep — they're
answering the same question (what shape does this package currently export) from two
angles (npm's resolver vs. runtime-readable constant).

**Lesson:** When bumping `SCHEMA_VERSION` for a breaking change, always bump
`package.json`'s version in the same commit/edit. Consider whether these two constants
should be merged into one source of truth later (e.g. reading version from package.json
at build time) once there's a second consumer to prove out the pain point.
