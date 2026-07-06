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

---

## 2026-07-06 (session 2, continued)

### 006 — Two Figma text fields were hardcoded to a default because the one sample fixture never exercised them

**What happened:** `map-text.ts` mapped `textDecoration`/`textCase` to a literal `"none"`
for every text node, instead of reading Figma's real fields. Root cause: the one real
Figma text node I sampled while building fixtures (`get started` button label) happened
to have no underline/uppercase styling, so Figma's REST API omitted those two fields
entirely from that response (Figma only includes them when non-default). I wrote
`RawTextStyleSchema` to match only what I'd actually seen in that one sample, then
defaulted the mapper output for fields the schema didn't even declare — instead of
checking Figma's API docs for the full field list before finalizing the raw schema.

**How found:** User asked, correctly and pointedly, why hardcoded values existed at all
in a mapper whose entire purpose is "fetch what exists" — the right question to ask any
time a mapper function contains a literal instead of a field read.

**Fix:** Added `textDecoration` (`NONE`/`UNDERLINE`/`STRIKETHROUGH`) and `textCase`
(`ORIGINAL`/`UPPER`/`LOWER`/`TITLE`/`SMALL_CAPS`/`SMALL_CAPS_FORCED`) to
`RawTextStyleSchema` per Figma's documented API, wired the mapper to translate real
values, and added `map-text.test.ts` with explicit cases for each non-default value so
this can't silently regress. Fallback to `"none"` only happens when Figma's response
itself omits the field (a real default, not an adapter shortcut).

**Lesson:** One real sample proves a *shape* is roughly right; it does not prove a schema
is *complete*. Before finalizing a raw-type schema for an external API, cross-check the
full field list against that API's docs (not just the one response captured), especially
for fields whose default value causes the API to omit them entirely — those are exactly
the fields a single sample will never surface. Also: any hardcoded literal standing in
for a mapped field is worth a second look — if it's not commented as "no data available
for this yet" (like the multi-run text gap already was), it might just be a fetch that
was never finished. [[001]]

### 007 — Penpot's default response format is Transit-JSON, not plain JSON

**What happened:** First live call to Penpot's `POST /api/rpc/command/get-file` returned
a wire format like `["^ ","~:features",["~#set",[...]],...]` — Clojure's Transit-JSON
encoding (`~:` keyword prefixes, `~#set`, `~u` for uuids, `~m` for instants). Parsing that
directly would have meant writing a Transit decoder before any adapter code could start.

**Fix:** Adding `Accept: application/json` to the request header switches Penpot's API to
plain camelCase JSON. Confirmed via `curl -I` that this is a real content-negotiation
path, not a fluke — Penpot's backend is Clojure-native and Transit is its default, but it
honors a plain-JSON request like any REST API would.

**Lesson:** When a new external API's first response looks like unfamiliar wire-format
noise, check for content-negotiation headers before writing a custom parser — many
non-JS-native backends (Clojure/Transit, Erlang/BERT, etc.) default to their own
ecosystem's serialization but support `Accept: application/json` as an escape hatch.

### 008 — Penpot's shape graph is flat (id map + parentId/shapes[]), not nested like Figma's

**What happened:** Figma's REST API nests children directly inside each node's
`children` array — the whole document is one recursive JSON tree. Penpot's page data is
the opposite: `data.pagesIndex[pageId].objects` is a flat `{id: shape}` map; every shape,
however deeply nested visually, is a sibling entry, connected only by `parentId` (up) and
`shapes: [childId, ...]` (down, on container types).

**Fix:** `parse-penpot-page.ts` walks from the synthetic root frame
(`00000000-0000-0000-0000-000000000000`) through `shapes` arrays, looking each child id
up in the flat map, to reconstruct the same nested `DesignNode` tree shape the Figma
adapter produces directly. This also drove the parent-relative position math (`009`
below) — the flat graph has no implicit nesting to inherit coordinate space from, so the
walk has to carry the resolved parent's absolute box down explicitly at each level.

**Lesson:** Don't assume a second adapter for "the same kind of thing" (design tool APIs)
shares structural shape with the first. Two REST APIs describing visually identical
documents can have completely different data models (recursive tree vs. flat graph);
verify structure before designing the mapping function's signature, not after.

### 009 — Penpot has no parent-relative position field; computed via top-down absolute-box subtraction

**What happened:** Canonical `PositionSchema` (locked in during Figma adapter work, see
`001`) requires parent-relative local coordinates. Figma provides this directly via
`relativeTransform`. Penpot shapes only carry page-absolute `x`/`y` (or `selrect` for
`path` shapes, which have null x/y/width/height) — there is no parent-relative field at
all in Penpot's data model.

**Fix:** `map-geometry.ts`'s `mapGeometry(shape, parentBox)` takes the resolved parent's
absolute box as an explicit second argument and computes `localX = shape.x - parent.x`
(same for y). `parse-penpot-page.ts` and `map-node.ts`'s `mapChildren` thread each
container's own absolute box down to its children as they're walked — this only works
because of the flat-graph walk in `008`, which already has to resolve each shape's parent
before recursing into its children.

**Lesson:** When two adapters must produce the *same* canonical geometry contract from
sources with different native coordinate spaces, the derivation logic belongs in the
adapter, not the schema — confirmed with the user before building this (see conversation
in session 2) rather than silently picking a convention. Keeping `PositionSchema` itself
unchanged, and doing the absolute-to-relative math per-adapter, is what let both adapters
converge on identical output shapes for visually identical designs.

### 010 — Penpot component instance = a `frame` shape with `componentId` + `componentRoot`, not a distinct type

**What happened:** Figma has a genuinely separate `INSTANCE` node type. Penpot has no
such type — a component instance is just a regular `frame` shape that additionally
carries `componentId` (pointing at the definition), `componentRoot: true`, and
`componentFile` (which file the definition lives in, for cross-library references).

**Fix:** `map-node.ts`'s `"frame"` case checks `shape.componentId && shape.componentRoot`
before falling through to a plain `frame` mapping, and produces a `component-instance`
DesignNode in that branch instead. Cross-file component references
(`componentFile` != current file) aren't resolved yet — tracked as a known gap in the
adapter's README rather than silently mapped wrong.

**Lesson:** "Does this API have an equivalent node type" is the wrong question when
porting a mapping pattern between two adapters for structurally different sources — the
right question is "does this API have equivalent *information*, however it's shaped."
Penpot has the same instance/definition relationship as Figma, just encoded as fields on
an existing type rather than a new type.

---

## 2026-07-06 (session 3 — live testing against real, unsampled pages)

Both adapters had passed every fixture test. User asked to actually run them against live
API data with a small runner script (`scripts/fetch-figma-live.ts`,
`scripts/fetch-penpot-live.ts`) rather than stopping at fixture-only proof. This
immediately found two real bugs that hand-picked sampling had missed — both were on
*other* shapes in the same file than the ones originally sampled, on pages/nodes never
individually inspected before.

### 011 — Some Penpot `rect` shapes carry a `content` field shaped as a path-command list, not the plain string `path` shapes use

**What happened:** `RawShapeSchema.content` only allowed `string | RawTextContent`
(matching the one `path` shape and one `text` shape sampled during fixture-building).
Running the adapter live against a full real page (not the hand-picked fixture) hit a
`rect` shape with `content: [{command: "move-to", params: {x, y}}, {command: "line-to",
...}, ...]` — a third content shape never seen. Parsing failed for the entire page
(Zod's `invalid_union` on one field short-circuited the whole `objects` map parse).

**Fix:** Added `RawPathCommandContentSchema` (array of `{command, relative?, params?}`)
as a third union member on `content`. The adapter doesn't map this shape's data yet
(rects still get their outline from `synthesizeRectPath`, see `README.md`) — the schema
just needs to accept it without erroring, so one shape with this field doesn't fail
validation for every other shape on the same page.

**Lesson:** A single malformed/unusual field on one node, in a schema validating an
entire flat object *map*, fails the whole map — not just that one node — unless the
union covers every real variant. This is a direct consequence of validating the whole
page as one object (see `008`); worth remembering when normalization/MCP work later
needs partial-success semantics (map what validates, report what doesn't, rather than
all-or-nothing).

### 012 — Penpot's `rotation` field can be explicit `null`, not just absent

**What happened:** `rotation: z.number().default(0)` assumed the field would either be a
real number or omitted entirely (Zod's `.default()` only fills in for `undefined`). A
real shape on a different, unsampled page (`Main components`) had `rotation: null`
explicitly — `.default()` doesn't catch that, so Zod rejected it as `expected number,
received null`.

**Fix:** Changed to `z.number().nullable().optional().transform((v) => v ?? 0)`, which
collapses both `null` and `undefined` to `0`.

**Lesson:** `.default()` in Zod only helps with a *missing* key, not an *explicitly null*
one — APIs that distinguish "omitted" from "present but null" (or don't distinguish
consistently, as here) need `.nullable()` composed in explicitly, every time, not just
where a single sample happened to show it. Same root lesson as `006`/`001`: a schema is a
hypothesis about the full range of real values, not just the ones seen so far — and the
fix for that isn't "sample more," it's "test against a live, full, previously-unseen
dataset before calling an adapter done," which is exactly why this session's runner
scripts were worth building even though the code they exercise had already "passed."

---

## 2026-07-06 (session 4 — starting step 4, normalization + eval scaffolding)

Both adapters (steps 2, 3) confirmed done per context.md §6: build clean, all tests
green, live-tested (session 3), known gaps documented in each README rather than silently
mapped wrong. Committed the session-3 fixes (011, 012) as a standalone commit before
starting new work.

### 013 — Normalization role taxonomy has no home in the schema, by design

**What happened:** Step 4 (normalization layer) needs a `RoleLabel` concept (button,
card, icon, ...) before any heuristic or eval label can be written, but
`schema/src/*.ts` has no `role` field anywhere — never added, not an oversight.

**Fix:** Confirmed with the user rather than guessing: `RoleLabel` and `RoleAssignment`
(`{ nodeId, role, confidence }`) live in a new `/normalization` package, not on
`DesignNode` itself. Role assignments reference a node by `id` as a separate, parallel
structure — the canonical schema stays purely structural, and the same tree can be
scored against multiple heuristic versions without cloning or mutating it.

**Lesson:** context.md §1 already drew this line ("normalization... resolves semantic
role... from inconsistent authoring" as its own numbered layer, separate from the
schema), but it's easy to reach for "just add an optional field" when a new concept needs
somewhere to live. When a module boundary is already specified, adding the new concept
as an annotation/side-table that references the existing type by id is usually right,
not a field bolted onto the type itself — especially for a type (`DesignNode`) whose
whole job is being source-of-truth structure shared across adapters, normalization, and
renderers alike.

### 014 — Eval set (§7) has to exist and be scored before any heuristic is "proven," not after

**What happened:** Default instinct was to start writing role-inference heuristics
directly (pattern-match on node name/type/size for "looks like a button"). context.md §7
is explicit that no accuracy claim about normalization means anything without a number
from the hand-labeled eval set — writing heuristics first and backfilling eval labels
later would have repeated the exact mistake `001`/`006`/`012` already paid for once
(building against assumption before touching real, varied data).

**Fix:** Scaffolded `/eval` (fixtures/, labels/, `score.ts`) and `/normalization`
(`role-label.ts` defining `ROLE_LABELS`, a small common-UI starting set: button, card,
icon, nav-item, input-field, heading, body-text, image, avatar, badge, other) before
writing a single heuristic. `score.ts` reports precision/recall **per role category**
(not an aggregate pass rate) per §4.8 — a regression hidden inside an improved aggregate
is exactly the failure mode that requirement exists to prevent. Added a scoring smoke-test
fixture/label pair to unit-test `score.ts` itself, since the scoring logic is now
load-bearing for every future heuristic decision and deserves its own coverage before any
real labels exist.

**Lesson:** "Scaffolding before the interesting code" isn't busywork here — for a step
whose entire done-criteria (§6) is an accuracy number against a held-out set, the
scoring harness *is* part of the deliverable, and building it first forces the label
format and role taxonomy to be nailed down before heuristic code silently assumes a shape
for them. Next real step: fetch one real (anonymized) Figma file and one real Penpot file
via the existing `fetch:figma`/`fetch:penpot` scripts, hand-label them against
`ROLE_LABELS`, *then* write the first heuristic.
