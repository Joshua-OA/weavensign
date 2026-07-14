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

---

## 2026-07-07 (session 5 — first real eval fixtures, three more live-data schema bugs)

Fetched a real Figma file (e-commerce landing page, `Home-Landing` frame, 261 nodes) and a
real Penpot file (logo/SVG artwork page, 162 shapes) per `014`'s next step. Original
`FIGMA_TOKEN` was rate-limited (`retry-after: 270420`s — a starter-plan API quota
exhaustion, not a transient 429; confirmed via `x-figma-plan-tier: starter` /
`x-figma-rate-limit-type: low` response headers) — user supplied a second token
(`FIGMA_NEW_TOKEN`) with access to a different file, used for both live fetches this
session. Hit three more real schema gaps live, same class as `006`/`011`/`012`.

### 015 — Figma image fill `scaleMode` has a fifth real value, `STRETCH`, not in the original four

**What happened:** `RawImagePaintSchema.scaleMode` (and canonical `ImageFillSchema`)
only allowed `FILL | FIT | CROP | TILE` — the four documented as Figma's scale modes.
A real image fill on an unsampled node had `scaleMode: "STRETCH"`.

**Fix:** Added `"STRETCH"`/`"stretch"` as a fifth member to both the raw
(`adapters/figma/src/raw-paint.ts`) and canonical (`schema/src/style.ts`) enums, and the
cast in `map-paint.ts`. Penpot adapter doesn't touch `scaleMode` at all, so no parallel
fix needed there.

**Lesson:** Same root cause as `001`/`006`/`012` — a schema modeled from docs/samples
rather than exhaustively verified against the real API surface. Figma's own docs undercount
their enum's real values; "documented four options" was not "the actual four options."

### 016 — Figma `fontStyle` is not a closed enum at all — it's the font family's own free-form style/weight name

**What happened:** `RawTextStyleSchema.fontStyle` was `z.enum(["Regular","Bold","Italic","Bold Italic","Medium","Light"])`,
built from the one sample seen in `006`. Live data hit `"Book"` (session 4 prep) and then
`"Black"` and `"SemiBold"` (this session) — none in that set. Root cause: `fontStyle` in
Figma's API is literally whatever string the active font family names that weight/style
variant (varies per family — "Book", "Black", "SemiBold", "Heavy" are all real, common
values across different type families), not a fixed vocabulary Figma defines.

**Fix:** Changed `RawTextStyleSchema.fontStyle` to `z.string().optional()`. Canonical
`TextStyle.fontStyle` stays `"normal" | "italic"` (correct — that's a CSS concept, not a
passthrough of Figma's field) but the mapper (`map-text.ts`) now derives it via
`rawFontStyle?.toLowerCase().includes("italic")` instead of an exact-match table lookup
against a hardcoded set of style names — the *only* signal the canonical field needs from
this free-form string is "does the name say italic."

**Lesson:** A field name matching a familiar CSS/design concept (`fontStyle`) doesn't mean
the external API models it the same way. Figma's `fontStyle` looks like it should map 1:1
to CSS `font-style`, but it's actually closer to a font-weight-name string; treat every raw
field's *actual value space* as unverified until live data forces the question, regardless
of how familiar the field name seems.

### 017 — Stroke-only vector shapes (e.g. Figma `LINE`) have empty `fillGeometry`; their outline lives in `strokeGeometry` instead

**What happened:** `map-node.ts` mapped canonical `paths` only from `node.fillGeometry`.
A real `LINE` node (fills: [], strokes: [one solid stroke]) had `fillGeometry: []` —
correct per Figma (a line has no fill), but the adapter's `.min(1)`-validated canonical
`paths` array then failed schema validation on `[]`, because the shape's actual visible
geometry is in `strokeGeometry`, which the adapter never read at all (field wasn't even
declared on `RawVectorLikeNodeSchema`).

**Fix:** Added `strokeGeometry` to `RawVectorLikeNodeSchema` (and its hand-written
`RawVectorLikeNode` interface counterpart, per the `003` pattern — every Zod-mirroring
type needs its optional fields kept in lockstep). `map-node.ts`'s vector-leaf case now
falls back to `strokeGeometry` when `fillGeometry` is empty.

**Lesson:** "Empty array" from an external API is not always "no data" — for a stroke-only
shape it's the *correct* value for one field while the real geometry is in a sibling
field. A `.min(1)` constraint on a mapped array is itself a signal to check: is empty ever
a legitimate upstream value, and if so, is there a fallback source the mapper should check
before concluding data is missing?

### Fixtures produced this session

- `eval/fixtures/figma-ecommerce-landing.json` — 261-node real e-commerce landing page
  (brand name anonymized: "Fitweargh"/"Fitwear gh" → "Acme Apparel"; currency-code string
  "ghs" left as-is, it's a unit not an identifier).
- `eval/fixtures/penpot-logo-artwork.json` — 162-shape real SVG logo/artwork page (domain
  anonymized: "ape.wtf" → "example.com"). Note: this file also has pages containing
  Penpot `bool` (boolean-operation) shapes, which the adapter intentionally rejects (see
  `raw-shape.ts` comment) — deliberately picked a page with zero `bool` shapes for this
  fixture rather than extending adapter scope to cover a documented, known gap.

Both fixtures round-trip cleanly through `DesignNodeSchema.safeParse` after the `015`–`017`
fixes. Labeling against `ROLE_LABELS` is the immediate next step, still not started.

### 018 — Draft-labeled both fixtures myself; flagged as unreviewed, not ground truth

**What happened:** User asked to continue toward the first heuristic. Hand-labeling 261 +
161 nodes across two fixtures by reading node name/type/text/geometry — labeling logic
that overlaps almost entirely with what a heuristic itself would do. If I also write the
heuristic later, scoring it against my own labels risks circularity: precision/recall would
measure "does the heuristic match my labeling logic," not "does it match real semantic
role," which defeats the purpose of an independent eval set (context.md §7).

**Fix:** Labeled both fixtures anyway (unblocks heuristic development now) but marked the
result explicitly as an unreviewed draft, not ground truth — added a caveat section to
`eval/README.md` Status calling this out, and recommending (a) human review/correction of
`labels/*.json` before treating any score against them as a real accuracy number, and
(b) more fixtures from more varied files/authors before the eval set is broad enough to
mean anything about generalization — user explicitly noted the normalization layer will
face "many other links" beyond the ones tested, not just these two files' naming/authoring
idioms.

**Lesson:** When the only labeler available is the same agent that will write the
heuristic, self-labeling is a reasonable *bootstrap* (don't block on human availability)
but must be flagged in-repo as unreviewed, not silently treated as the hand-labeled ground
truth context.md §7 requires. The flag itself (in README, not just this log) is what keeps
a future accuracy claim from being taken at face value by someone who didn't see this
conversation.

**Label distribution (sanity check, not a validation):**
- Figma fixture (261 nodes): other 61, icon 36, badge 48, body-text 34, nav-item 12,
  heading 5, image 32, card 19, button 14 — plausible given many repeated product-card
  instances (drives up card/badge/image counts) and a small nav/footer.
- Penpot fixture (161 nodes): image 158, other 2, body-text 1 — correct given the page is
  one traced composite SVG illustration with no interactive-UI roles present at all; this
  fixture alone can't exercise most of `ROLE_LABELS` and shouldn't be read as evidence a
  heuristic handles button/card/nav-item well.

### 019 — First normalization heuristic: generalizable signals only, deliberately not derived from my own draft labels

**What happened:** With `018`'s draft labels in place, the obvious shortcut was writing a
heuristic that encodes the same node-name/text rules I'd just used to label the fixtures —
that would score near-perfectly but prove nothing (circular: heuristic learns my labeling
logic, not real design-authoring signal). User explicitly flagged that the normalization
layer will run against "many other links" at deploy time, not just these two tested files —
reinforcing that fitting to two fixtures' idioms was the wrong target.

**Fix:** Built `normalization/src/heuristics/` from signals that should transfer across
arbitrary files: node size/aspect ratio (icon vs image), font size + text length (heading
vs body-text), a small dictionary of common cross-site UI phrases ("add to cart", "view
all", "home"/"cart"/"account") for button/nav-item, and sibling-name repetition + rough
proportions for card detection on containers. Explicitly did not special-case anything
specific to the two fixtures (no "Fitwear"/"Acme Apparel"-specific rules, no reliance on
this file's exact layer names). `classify-node.ts` dispatches via an exhaustive `switch` +
`assertNever` per `004`, and its tree-walk uses a top-level named recursive function
(`classifySiblingGroup`), not a nested closure, per §4.2.

**First honest score** (via new `eval/run-heuristic.ts`, `npx tsx eval/run-heuristic.ts`):
button P1.00/R0.79, heading P1.00/R0.60, image R0.97 (Figma fixture) — strong, as expected
from clear signals. badge P0.07/R0.06 and body-text R0.12 — weak, because the heuristic has
no real badge signal (falls back to a length-threshold guess that misfires on short product
copy) and no way to distinguish "short label" from "short badge text" yet. Penpot fixture
scores `image` at P1.00 but only R0.30, because many individual SVG path fragments of one
composite illustration are each small enough to look like `icon`s in isolation — a real
limitation (size alone can't tell "small icon" from "small fragment of something bigger")
worth fixing with a container-context signal later, not by special-casing this file.

**Lesson:** When you are both the heuristic author and (in `018`) the label author, the
only way to get a meaningful first score is deliberately choosing signals that don't
retrace your own labeling steps. A heuristic that scores perfectly against self-authored
labels is a red flag, not a result — the weak categories this run surfaced (badge,
body-text, icon-vs-image-fragment) are the actually useful output of this pass, since they
point at real gaps rather than confirming a foregone conclusion.

**Next**: address the weak categories (badge needs a real signal — likely small-fixed-size
+ non-repeating, or explicit color/shape cues once style data is used; body-text needs to
stop misfiring on short strings that aren't badges; icon-vs-image needs a "is this one of
many same-parent vector fragments" check). Also still pending from `018`: human review of
the draft labels, and adding more/varied fixtures before any score here is a real accuracy
claim per context.md §7.

### 020 — Fixing badge/body-text/icon weaknesses: pixel size alone can't separate "small icon" from "small badge dot" — sibling clustering can

**What happened:** Iterating on `019`'s weak categories: (1) dropping the length-based
badge fallback in `classify-text.ts` fixed body-text (R0.12→1.00) immediately, since almost
all its false negatives were short non-badge strings ("ghs 200.00", product names) wrongly
guessed as badge. (2) First badge fix attempt added a "parent container is small" signal to
text classification — checked against real badge-labeled nodes and found it *never fired*:
real text badges here ("10", "SPORTS BRA") sit inside normal/large card containers, not
small ones; the parent-size assumption was simply wrong, so it was removed rather than kept
as dead code. (3) First vector-badge attempt used a flat pixel-size cutoff
(`longestSide <= 12`) — this collided badly with real icons: 18 of 36 real icon-labeled
vectors in the fixture are ~10x9px (arrow glyphs), i.e. the *same size range* as the real
badge dots (Ellipse 14/15/16 at ~8.4x8.4px). A universal size threshold cannot separate
these; icon recall cratered to 0.17 as a direct result.

**Fix:** Inspected the actual sibling context of a real badge cluster vs a real standalone
icon directly in the fixture: the three Ellipse badges always appear as 3 same-tiny-size
vector siblings under one card container (a "status dots" row pattern); the real icon
Vector is the *only* vector sibling in its parent Frame. Reworked `classifyVector` to use
vector-sibling-count as the discriminating signal instead of pure size: 1 vector sibling
alone → icon (even if tiny); 2-7 same-parent vector siblings, all small/square → badge
(a dot cluster); 8+ → image fragment (per `019`'s existing signal). Result: badge
P0.07→1.00 precision, R0.06→0.94 recall; icon P1.00, R0.67 (recovered from the 0.17 dip,
though still below `019`'s original 0.92 — a real precision/recall trade against
misclassifying tiny standalone icons, judged acceptable since perfect badge precision was
the bigger win). No other category regressed relative to `019`'s baseline.

**Lesson:** When a size-only threshold produces a real false-positive/false-negative
collision (not just a rough edge case), the fix is not "adjust the number" — pull the two
colliding real examples from the fixture directly and diff their *context* (siblings,
parent, repetition), not just their own dimensions. The signal that actually separates
"tiny icon" from "tiny badge" was never in the node's own size at all; it was in how many
same-sized siblings sit next to it. This is the same class of insight as `009`
(geometry needs parent context) and `018`'s container-repetition signal — role inference
for a single node very often depends on information a size/type check of that node alone
cannot see.

---

## 2026-07-08 (session 6 — closing the `bool`-shape gap, third fixture, confirming the generalization gap)

User flagged, before any new work: "penpot might propose a challenge later" — anticipating
that a heuristic tuned only against the two `019`/`020` fixtures (one Figma e-commerce page,
one Penpot pure-artwork page with almost no interactive UI) hadn't actually been tested
against real Penpot *application* UI at all. Correct call — see below.

### 021 — Penpot `bool` (boolean-combined) shapes: the documented "gap" was actually trivial to close, and the file that needed it was a real UI dashboard using them for icons

**What happened:** User provided a new Penpot page (a "Dash (dark)" dashboard board) to
use as a Penpot-UI fixture. First fetch hit the exact documented gap from `011`: `bool`
shapes rejected at parse time, failing the whole page. Inspecting the real `bool` shape
data directly (not guessing): `boolType: "union"` shapes here are literally named
`icon_avatar` — Penpot's own dashboard demo builds its avatar icon by boolean-unioning
circles, not a special/rare case but a normal real-world UI pattern.

**Fix:** `bool` shapes carry the exact same `content` (flattened SVG path string), `fills`,
and null-x/y/width/height + `selrect` shape as `path` shapes already do — Penpot has
already resolved the boolean operation into one path by the time it's served over the API.
Added `"bool"` to `SHAPE_TYPES` and a `case "bool":` alongside the existing `case "path":`
in `map-node.ts` (same mapping, same canonical `vector` output). The `boolType` and the
`shapes` array (ids of the shapes that were combined to produce it) are construction-time
provenance the adapter doesn't need — the rendered result is fully captured by `content`.
No schema changes needed (`shapes` field already existed, shared with group/frame usage).

**Lesson:** `011`'s original gap note said "no canonical equivalent exists yet" for `bool`
— that was wrong the whole time; the equivalent (`vector`) already existed and Penpot had
already done the hard part (flattening the boolean op to a path) before the API response
even reached the adapter. A "known gap, tracked not guessed at" note is a snapshot of
*current* adapter scope, not a permanent architectural verdict — worth re-examining once
real data (here, a real UI file that needed it) makes it worth another look, rather than
assuming a past "no equivalent" note is still true.

### 022 — Third fixture (Penpot dashboard UI, 389 nodes) confirms the heuristic doesn't generalize past the two files it was tuned against

**What happened:** With `021`'s fix, fetched and fixture'd a real Penpot dashboard board
(`dash_dark` — search bar, stat pills, nav rail, calendar, message cards, task form,
buttons, avatars). Anonymized real personal names present in Penpot's own demo content
("Benedict Cumberbatch", "Alice Kay", "Ben Andrews", etc. — genuine names baked into
Penpot's stock dashboard template, not the user's private data, but anonymized anyway per
this project's convention) before writing to `/eval/fixtures`. Draft-labeled all 389 nodes
(same unreviewed-draft caveat as `018`) — first fixture to exercise `avatar` (8) and
`input-field` (3) at all, previously untested roles.

Running the existing heuristic (unchanged from `020`) against it: button **R0.00** (missed
entirely — Penpot buttons here are `component-instance`-wrapped vector+text with label
words like "LOAD MORE"/"back up data" not in `BUTTON_LABEL_WORDS`, and `classifyContainer`
has no button-detection path at all), avatar **R0.00** (no avatar signal exists anywhere —
`icon_avatar` bool-shapes get caught by existing size/cluster rules as icon/badge instead),
nav-item **P0.00/R0.00** (Penpot's nav icons are `group`s here, not `text`, so the
text-based nav-word dictionary never fires and containers have no nav-item path either),
`other` **P0.13** (46 false positives — heavy fallback-bucket miscategorization), image
**P0.25** (68 false positives — many decorative rects wrongly called images). Figma
fixture's scores (`020`'s numbers) are completely unchanged, as expected — the heuristic
wasn't touched this session, only measured against new data.

**Lesson:** This is exactly the outcome the user's opening intuition predicted, now with
numbers attached — a heuristic built and tuned against one design tool's authoring idioms
(Figma's component-instances, sibling-repetition patterns, text-based nav labels) does not
transparently transfer to a different tool's structural conventions for the *same visual
concepts* (buttons, avatars, nav) even when the canonical schema already unifies both
tools' output. This is the same root lesson as `008`/`010` (two adapters for visually
similar things can have very different underlying structure) but now demonstrated one
level up, at the normalization/heuristic layer rather than the adapter layer. The three
fixtures now cover meaningfully different territory: Figma e-commerce (button/card/nav
heavy), Penpot pure-artwork (image-only, no UI), Penpot dashboard (button/avatar/input-field/
nav-item, previously zero coverage on three of those four). **Next**: extend
`classify-container.ts` with a real button-detection path (small-ish container, single
text+vector children, inside a form/action context) and an avatar signal (small
roughly-circular vector or bool-shape, likely named/clustered near message-style rows), and
extend nav-item detection to consider non-text (icon-group) nav items, not just text labels
— then re-score all three fixtures together to confirm no regression on the Figma numbers
while closing the new gaps. Still open from `018`/`020`: human review of all three
fixtures' draft labels before any score here is a real accuracy claim per context.md §7.

### 023 — Closed `022`'s four gaps with structural (not textual) container signals; one regex over-match caught before it shipped

**What happened:** Before writing any new signal, pulled the real ground-truth nodes for
each weak Penpot-dashboard role directly from the fixture (same discipline as `020`) rather
than guessing shapes: real `button` containers (`Button-1/2/3`) are a 2-child
group/component-instance — one `text` label, one `vector` background sized to ~full
container width (ratio ≥0.9) — vs. a visually similar Figma icon+label pair ("Account" +
28px icon next to 63px text, ratio 0.29) that must **not** match; real `avatar` nodes are
`vector`s literally named `icon_avatar` (Penpot's own dashboard-template convention, not
fixture slang, confirmed via `021`'s finding that avatars are boolean-unioned circles
flattened to one path); real `nav-item` containers (`nav`'s 8 children) are all-vector,
no text child, ~22px square, in a same-shaped 8-sibling group; real small `badge` containers
(`stat-1/2/3`) are 2-text + 1-background-vector pills only ~16px tall (vs. a button's ~42px),
distinguishing the two composite roles by height alone.

**Fix:** `classify-container.ts` gained three new structural checks (`looksLikeButton`,
`looksLikeBadge`, `looksLikeNavItem`) run before the existing repetition/proportion card
logic, plus the repeated-sibling threshold's minimum side dropped to 30px (was 100px) so
compact list-row "cards" like `Component-1..4`/message rows can match repetition even
though they're far smaller than the original card-min-side assumption (which was tuned
against Figma's much larger product cards). `classify-vector.ts` gained `isAvatarShape`
(name match + size/aspect guard, checked before the existing size-cascade). Sibling
repetition matching (`countSiblingsWithSameName`) switched from exact-name to
suffix-stripped prefix match, because Penpot's real duplicate-instance naming convention is
`message`/`message-1`/`message-2` (no exact match at all), unlike Figma's exact-repeat
`"product card"` naming.

**Caught during verification, not shipped:** first prefix-strip regex
(`/[-\s]?\(?\d+\)?$/`) also stripped Figma's *generic* auto-numbered default names
("Group 15", "Group 16", "Group 17" — unrelated layers that just happen to be
sequentially auto-named), which collided them into a false repeated-card match and
dropped Figma card precision 0.79→0.69 on the very next scoring run. Root cause: Figma's
generic auto-name uses a bare space before the number; Penpot's real duplicate-instance
suffix is always hyphen- or paren-attached. Narrowed the regex to only strip `-N` / `(N)`
forms, re-scored, confirmed Figma's card score returned to exactly its pre-change baseline
(0.79/0.79) with zero other category regressions. Also caught one bad unit test during this
pass — a synthetic 315x50 "message" fixture asserting `card` that doesn't actually match
(aspect ratio 6.3 exceeds `CARD_MAX_ASPECT_RATIO`); traced against the real fixture and
confirmed real `message-N` nodes score `other`, not `card` (the earlier recall gain
actually came from `Component-1..4`) — fixed the test to use a real card-shaped repeat
case instead of asserting on a guess.

**Score deltas (dashboard fixture; Figma fixture unchanged in every category):**
avatar 0/0 → P1.00/R1.00 (tp 0→8), nav-item P0.00/R0.00 → P0.89/R1.00 (tp 0→8),
button R0.00 → P0.75/R0.50 (tp 0→3), card R0.48→0.62 (tp 10→13), badge R0.70→0.77
(tp 30→33). `other`/`image` false-positive counts on the dashboard fixture (28/68)
are unchanged — those come from large flat-color background rects (chart bg, message
bg) being caught by the vector size-fallback rule, a distinct and harder gap (need
fill-data or container-context signal to tell "background rect" from "real image") not
touched this pass.

**Lesson:** Two reinforcing points. (1) Same as `020`: pulling the real colliding examples
(button vs. icon+label pair; real avatar vs. a size-guarded name match) and diffing their
actual structure, not adjusting a threshold on a hunch, is what produced a clean
discriminator (background-width-ratio, all-vector-no-text) on the first attempt. (2) A
generalization applied to fix one tool's naming convention (Penpot's `-N` suffix) can
silently break another tool's *different* convention for a superficially similar pattern
(Figma's ` N` generic default) — the fix isn't "don't generalize," it's "immediately
re-score every existing fixture after any generalization, before trusting the new signal,"
which is exactly the check that caught this before it shipped. Per `018`/`022`: all
label sets used here are still unreviewed drafts, not ground truth — these are heuristic
progress numbers, not accuracy claims.

### 024 — Two of `023`'s three follow-ups were draft-label noise, not heuristic gaps; the third (background-rect vs. image) had a real, cheap fix

**What happened:** Investigated the three items `023` left open (dashboard `heading`
recall 0.21, `icon` recall 0.44, and the `other`/`image` false-positive cluster) before
writing any code. `heading` misses were all 11-13px UI micro-labels ("mon"/"tue", "SIZE",
"FILE NAME", "Task name") draft-labeled `heading` inconsistently — chasing them would mean
lowering the heading font-size floor and wrecking `body-text` precision project-wide, the
wrong fix for a labeling problem, not a heuristic one (leaving as-is). Digging into `icon`
misses surfaced the real, fixable issue underneath: large flat-color rects literally named
`bg`/`bg-2`/`bg-3`/... (Penpot's own naming convention for a card/row/button's backdrop
panel) were falling into the size-based `image` fallback in `classify-vector.ts`, when
ground truth never labels a `bg`-named shape `image` (always `icon` or `other`, split by
context, but never image) — real content rects use different names (`Rect-N`, `Circle-N`,
`graph`). Separately, near-zero-height/width "hairline" vectors (`Path-N` grid lines,
`scroll`, `sideline`, `topline` — decorative divider lines, height/width ≈0.01–1px) were
also landing in `image` for the same reason (large longest-side, size cascade never
considered a near-zero short side as its own category).

**Fix:** Added `isNamedBackgroundShape` (matches `^bg(-\d+)?$` exactly) and a hairline
check (`shortestSide <= 1px`) to `classify-vector.ts`'s fallback cascade, both checked
after the existing size/badge/icon rules and after the avatar/fragment-count checks —
`bg`-named large shapes now resolve to `icon` (matches the majority real label), hairlines
resolve to `other`. Verified no collision before shipping: `penpot-logo-artwork`'s fixture
has real `image`-truthed ~1x3px composite-SVG-fragment hairlines, but those are already
caught by the pre-existing 8+-vector-sibling fragment rule *before* reaching the new
hairline check, so they're unaffected (confirmed via direct query, not assumed).

**What was deliberately left alone:** button background rects (e.g. `Rect-9`, ground-truth
`other`) aren't caught by either new rule and still misclassify — but `classify-vector.ts`
only receives sibling count, not parent role, so telling "this rect is a button's own
background" from "this rect is real image content" needs parent-context data this
function's signature doesn't carry. Flagged as a real, structural gap (would need a
parent-role argument threaded through `classify-node.ts`, same shape as the geometry
parent-context work in `009`), not forced with a name-based guess.

**Score deltas (dashboard fixture; Figma/logo-artwork unchanged except one incidental
Figma `other` improvement from the same hairline rule, since Figma has its own decorative
lines):** icon recall 0.44→0.60 (tp 32→44), image fp 68→39, other precision/recall
0.13/0.08 → 0.35/0.31 (tp 4→15). Figma: other tp 35→37 (hairline rule applies there too),
every other Figma category exactly unchanged.

**Lesson:** Same discipline as `020`/`023` — pulled every real colliding node (`bg`-named
shapes across all their ground-truth roles, hairline shapes across all fixtures) before
writing the rule, and explicitly checked the new rule against fixtures it *wasn't* being
tuned on before calling it done. Also worth naming directly: not every item on a "next
steps" list is a heuristic bug waiting for a fix — two of three were draft-label quality
issues, and forcing a heuristic change to chase noisy labels would have been a regression
disguised as progress. Distinguishing "real signal the heuristic is missing" from "the
label itself is questionable" required going back to the source node every time, not
just trusting the aggregate score's shape.

### 025 — Closed `024`'s deferred parent-context gap: `classifyVector` now takes the node's parent

**What happened:** `024` explicitly deferred one gap: a button's own background rect
(Penpot's `Rect-9`, sibling of the button's text label, ground-truth `other`) was
misclassified as `image`, because `classify-vector.ts`'s signature only receives sibling
count, never parent — it can't tell "this rect is a button's own backdrop" from "this rect
is real image content." Confirmed via direct query (not assumed) that all three real
`Rect-9` instances in the dashboard fixture sit inside a 2-child (`vector` + `text`)
`Button-N` component-instance, same shape `classify-container.ts`'s `looksLikeButton`
already detects on the parent — and checked for collisions before writing the rule: one
`bg-5` vector matches the same 2-child/full-width shape but is ground-truth `icon` (a
named-background shape per `024`, correctly handled by the existing `isNamedBackgroundShape`
check firing first in the cascade), and no real `image`-truthed vector in either Penpot
fixture happens to sit in a 2-child button-shaped parent.

**Fix:** Threaded `parent: DesignNode | undefined` through `classify-node.ts`'s
`classifySiblingGroup`/`classifyOne` (previously only `nodes`/`siblings` were passed) down
into `classifyVector(node, vectorSiblingCount, parent)`. Added `isButtonBackgroundShape` —
re-runs `looksLikeButton`'s exact structural check (2 children, one text, one non-text
spanning ≥85% of parent width, pill-height range) from the vector's own side, placed in the
cascade *after* `isNamedBackgroundShape` so a real `bg`-named shape still wins, before the
generic hairline/image fallback. Also rebuilt `npx tsc -p tsconfig.json` in `/normalization`
before re-scoring — `eval/run-heuristic.ts` imports the built `@weavensign/normalization`
package, not source, so a code change with no rebuild silently re-scores the *old* behavior
(caught this firsthand: first re-score run showed zero change until the rebuild).

**Score deltas (dashboard fixture only; Figma and logo-artwork fixtures bit-identical,
confirmed, since neither has this button-shaped-parent pattern):** `other` tp 15→18
(P0.35/R0.31 → P0.39/R0.38), `image` fp 39→36. Small, deliberately narrow-scope fix.

**Lesson:** Two points. (1) `classifyOne`'s "classifies one node in context of its
siblings" doc comment was accurate but incomplete the whole time — sibling context alone
was never enough for this gap, exactly as `024` already flagged; the fix is structurally
identical to `009`'s parent-geometry-context pattern, now shown to apply at the
normalization layer too, not just adapters. (2) When a scoring script imports a *built*
package rather than source (check the import path before assuming "no change" means "no
effect") — a silent stale-build read looks exactly like a real negative result if you
don't check for it, and would have been mis-reported as "the fix didn't work" without
catching the rebuild step first.

### 026 — First `input-field` signal: two real examples, two different shapes, not one generalized rule

**What happened:** `input-field` had zero heuristic signal since scaffolding (`014`).
Pulled the real ground-truth nodes before writing anything (same discipline as `020`/`023`/
`025`): the eval set's 3 labeled `input-field` nodeIds resolve to only 2 visually distinct
shapes — Penpot's `search` group (1 `icon_search`-named vector + 1 text, ~254x18px) and a
`Group-3` message-input pill (1 background vector + 2 text runs — value and hint, ~315x40px)
wrapped by a `message-6` pass-through group that carries the label's 3rd nodeId but adds no
structure of its own. Checked both shapes for collisions against every other role at
similar sizes before writing rules: the 3-child bg+2-text composition never collides with
badge (same composition but height ≤20px vs input-field's 25–45px band) or card (same
height range as button but 3-not-2 children, and real card examples in that band are
2-vector+1-text or 4-child, never 1-vector+2-text); the search shape's 2-child
vector+text composition doesn't collide with button (button requires height ≥20px *and*
width ≥60px in a specific pill shape the 18px-tall search bar fails) or the icon+label pair
`023` already excluded from button.

**Fix:** Added two independent checks to `classify-container.ts`: `looksLikeSearchBox`
(exactly 1 vector + 1 text child, vector's name matches `/search/i` — deliberately
name-anchored since only one real sample exists, not generalized from size/shape alone)
and `looksLikeInputField` (exactly 1 vector + 2 text children, height between the badge and
card bands). Both run in `classifyContainer`'s cascade after nav-item, before the card
fallback. Did not add a rule for the `message-6` wrapper case (a group whose only child is
itself an input-field) — one example isn't enough to generalize a "pass-through wrapper"
signal from, flagged as a known recall gap in the README instead of guessing at a rule.

**Score deltas (dashboard fixture only; Figma/logo-artwork fixtures bit-identical, neither
has an `input-field`-labeled node):** input-field tp 0→2 (P1.00/R0.67, the `message-6`
wrapper is the one remaining miss), `other` fp 28→26 (both real input-field nodes had been
falling into `other` before).

**Lesson:** Same discipline as `020`/`023`/`025` — pull the real labeled nodes first, diff
their actual structure against every neighboring role at similar size/shape, and only then
write the narrowest rule that separates them. Worth naming here specifically: two ground-
truth examples of the same nominal role turned out to be two different structural shapes
(name-anchored search-box vs. composition-anchored input pill), not one generalizable
pattern — forcing a single rule to cover both would have meant either overfitting to one
shape's specifics or loosening the match until it collided with badge/card. Writing two
narrow, independently-justified checks was more honest than one broad guess, and is
consistent with `016`/`017`'s broader lesson that a single field or role name doesn't
imply one underlying representation.

### 027 — Called a halt on heuristic tuning: step 4 was never actually "done" by context.md's own definition, and six sessions of iteration had stopped being progress

**What happened:** User pushed back directly: "you keep checking the readme what about
context.md because it seems we have been running around in the same spot." Checked
context.md against what `019`-`026` had actually been doing. §2's step-4 done-when is
"scores ≥ an agreed precision/recall bar against the hand-labeled eval set (§7)"; §7 says
"no accuracy claim about the normalization layer is meaningful without a number from this
set." Neither half of that condition was ever satisfied: no bar was ever agreed with the
user (every score in the README was framed as "a rough baseline," never checked against a
target), and the labels themselves are still the unreviewed AI draft flagged in `018` and
re-flagged in every session since (`020`, `022`, `024`, `025`, `026`) without ever actually
being addressed. Six sessions of "found a gap, pulled real nodes, wrote a narrow rule,
rescored, confirmed no regression" was genuinely good methodology each time — but the
loop itself had no exit condition, because the two things that would end it (an agreed
bar, reviewed labels) were never pinned down to begin with.

**Fix:** Asked the user directly rather than guessing at a bar or unilaterally deciding
the review was optional. Given three explicit options (do the label review now, agree a
pragmatic bar against draft labels and call it done, or explicitly treat normalization as
provisional and move to step 5 regardless), user chose the third: stop tuning heuristics
for now, proceed to step 5 (MCP server) with normalization's current state — heuristics
implemented, gaps documented in README, labels still unreviewed — as a known, named
limitation rather than a silently-skipped gate.

**Lesson:** A well-run iteration loop (real data, no guessing, rescore every fixture, check
for regressions) can still be the wrong use of time if the loop's stopping condition was
never defined. context.md itself already specified that stopping condition (§2, §7) —
the mistake wasn't missing information, it was not checking a standing spec against six
sessions of accumulated activity until the user asked why progress felt circular. When a
project has a written build-order/definition-of-done doc, re-check current work against
it periodically, not just at the start of each session — "are we following the rules we
already wrote down" is a question worth asking on a cadence, not just once at kickoff.
Sequencing violations are explicitly called out in context.md §2 as "the most expensive
mistake on this project" — this wasn't a violation of the *order* (step 4 before step 5),
but the same failure mode one level down: treating an unbounded loop inside a step as
equivalent to finishing that step.

### 028 — Step 5 scaffold: MCP SDK 1.29.0 only typechecks with zod v4, not zod 3.25.x, despite claiming both as peer deps

**What happened:** Scaffolded `/mcp-server` (three tools: `get_figma_design`,
`get_penpot_page`, `classify_roles`, per user's explicit design choices — source-specific
tools, normalization as a separate tool not bundled into fetch, tokens via env var at
startup). `@modelcontextprotocol/sdk@1.29.0`'s `package.json` declares
`peerDependencies: { zod: "^3.25 || ^4.0" }`. Bumped zod from the existing 3.23.8 (pinned
across schema/adapters/normalization) to 3.25.76 to satisfy that range — and immediately
hit `TS2589: Type instantiation is excessively deep and possibly infinite` on every
`server.registerTool(...)` call, even a minimal single-string-field one with no relation
to this project's recursive `DesignNodeSchema`. Isolated the repro outside the repo (a
throwaway 6-line `registerTool` call, nothing else) to rule out anything project-specific
before concluding it was a real SDK issue. Confirmed directly: the same 6-line repro
typechecks cleanly under zod v4 (`4.1.13`) and fails under zod `3.25.76`, with identical
TypeScript version. The SDK's `zod-compat.d.ts` internally branches on
`z3.ZodTypeAny | z4.$ZodType` — the v3 branch of that compat layer is what blows the
instantiation depth; the peer-dep range claiming both work is aspirational/best-effort,
not actually verified for the v3 side at this SDK version.

**Fix:** Asked the user rather than guessing at scope — three options (bump everything to
zod v4, pin an older SDK release, or work around TS2589 locally in mcp-server only).
User chose the full v4 bump. Rippled through every package pinning zod: `schema`,
`adapter-figma`, `adapter-penpot`, `mcp-server` all bumped `3.23.8` → `4.4.3`. Two real
v3→v4 breaking changes surfaced in schema/adapter source (not test files): `z.ZodType<T,
Def, Input>`'s middle `ZodTypeDef` type parameter was removed — v4's `ZodType` takes only
`<Output, Input>` — so every recursive-schema annotation using the `003` house pattern
(`schema/src/nodes.ts`'s `DesignNodeSchema`/`childrenSchema`, `adapters/figma/src/raw-node.ts`'s
`RawNodeSchema`/`childrenSchema`) needed its 3-arg annotation trimmed to 2-arg. No other
source-level breakage — every adapter/normalization/eval test passed unchanged, and
rescoring all three eval fixtures post-bump produced bit-identical numbers to pre-bump,
confirming the migration was a pure type-level fix with zero behavioral change.

**Caught along the way:** running the full `npm run typecheck` (which chains a second
`tsconfig.typecheck.json` covering test files, on top of the `tsconfig.json --noEmit` that
excludes them) surfaced a real, pre-existing bug in my own `026` session's test fixture —
`classify-vector.test.ts`'s `makeTextChild` helper used `characters`/`textStyle` fields
directly on a mocked `TextNode`, but `TextNode.content` is actually `{ runs: [{characters,
style}], align, autoResize }` (per `typography.ts`), and `TextStyle` uses `fontSizePx`/
`letterSpacingPx`, not `fontSize`. This had been silently wrong since `026` — vitest
doesn't typecheck, so the 31 passing tests never caught it, and my own `npx tsc --noEmit`
checks during that session used the plain `tsconfig.json` (excludes `*.test.ts`), never
the second config. Fixed the fixture to match the real schema shape once the zod bump's
full-repo typecheck pass surfaced it.

**Lesson:** Three points. (1) A library's peer-dependency range is a claim, not a
guarantee — "we support ^3.25 || ^4.0" turned out to mean "v4 is the tested path, v3 is
best-effort and has a live bug at this version," discoverable only by actually
typechecking against both, not by reading the peerDependencies field. (2) When a version
bump is going to touch every package in a monorepo (not just the new one), stop and ask
before picking a target version — the zod 3.23.8→3.25.76 bump alone would have been
low-risk, but 3.25.76→4.x is a real breaking-change jump across four packages, exactly
the kind of dependency-discipline call context.md §4.5 reserves for a written decision,
not a silent pick. (3) Always run the *full* typecheck command (`npm run typecheck`, which
chains both tsconfig files here), not just a quick `tsc --noEmit` in one directory — the
narrower command had been silently skipping test-file typechecking all along, and a bug
sat undetected for two full sessions until a broader, unrelated change happened to run
the complete check.

### 029 — Step 5's real MCP Inspector run: two bugs the raw-stdio smoke test in `028` never would have caught

**What happened:** `028` closed with a raw JSON-RPC stdio smoke test standing in for a
real Inspector run, since Inspector needs a browser session unavailable in that context.
User ran the actual Inspector UI by hand this session. Two real problems surfaced that the
stdio substitute genuinely could not have caught: (1) Inspector's own STDIO transport
launcher failed with "Command not found, transports removed" when the Command/Arguments
fields held the bare relative values `node` / `dist/server.js` — Inspector's proxy process
doesn't run with `mcp-server/` as its cwd and doesn't resolve `node` through the same PATH
resolution a shell would; fixed by entering absolute paths (`/usr/local/bin/node` per
`which node`, and the full absolute path to `dist/server.js`) in the UI form fields. (2)
Every registered tool showed a `✓ Destructive` badge in the Inspector UI — wrong for all
three (`get_figma_design`/`get_penpot_page` only fetch, `classify_roles` only computes),
because `registerTool`'s `annotations` field (`readOnlyHint`/`destructiveHint`/
`idempotentHint`/`openWorldHint`) was never set in `create-server.ts`, so the SDK's
defaults applied instead of this project's actual tool semantics.

**Fix:** (1) is an environment/tooling gotcha, not a code bug — documented here so it
isn't re-diagnosed from scratch next time Inspector is launched against this server; no
source change needed. (2) is a real fix: added explicit `annotations` to all three
`registerTool` calls — `readOnlyHint: true, destructiveHint: false, idempotentHint: true`
on all three (none of them mutate anything or produce different output for the same
input), `openWorldHint: true` on the two fetch tools (real external network calls),
`openWorldHint: false` on `classify_roles` (pure local computation, no I/O).

User then ran both remaining Inspector checks live: `classify_roles` against a real
single-vector `DesignNode` returned the expected `{"nodeId":"1","role":"icon",
"confidence":0.6}`; `get_figma_design` with no `FIGMA_TOKEN` set returned the clean
`"FIGMA_TOKEN is not set in the server's environment."` tool-error result, not a crash —
confirming §4.6's error-as-value contract holds through a real MCP client end to end, not
just through unit tests exercising the function directly.

**Lesson:** A protocol-level smoke test (raw JSON-RPC over stdio, as `028` did) proves the
server speaks MCP correctly; it does not prove a *specific client's* launcher config or a
tool's *declared metadata* are right — those are exactly the two things this session's
real Inspector run caught that the substitute couldn't. Per context.md §6 ("every tool
callable and inspectable via MCP Inspector before any real client config is attempted"),
this is now genuinely satisfied for the first time — `028`'s stdio check was a reasonable
stand-in given the constraints of that context, but it was never a full substitute, and
this entry is the actual close-out of step 5's stated done-when.

---

## 2026-07-10 (session — starting step 6, HTML/CSS renderer)

Step 5 (MCP server) confirmed done via real Inspector verification (`029`). Step 4
(normalization) remains deliberately provisional per `027` — no agreed accuracy bar, draft
labels unreviewed. User explicitly chose to start step 6 (renderers) anyway, the same
"proceed with a named, provisional gap rather than block on it" call already made once for
step 5. Design decisions confirmed with the user before writing code (not guessed): vector
nodes render as inline `<svg>` (HTML/CSS can't natively paint arbitrary path data), one
`DesignNode[]` → one full HTML document string per invocation (matches golden-file testing
one fixture → one expected file), numbers rounded to a fixed precision (2 decimals for
pixels, 0-255 integers for color channels) rather than preserving raw float noise.

### 030 — First renderer bug: a `position: relative` declaration silently overrode `position: absolute` on the same element

**What happened:** Every node renders as one absolutely-positioned `<div>`, since
`PositionSchema` is parent-relative (schema/src/geometry.ts) and CSS `position: absolute`
+ `left`/`top` is the natural mapping. First draft additionally pushed an *unconditional*
`{ prop: "position", value: "relative" }` onto every *container* node's declaration list
(after its `position: absolute` from `geometryDeclarations`), on the theory that a
container needs to "establish a positioning context" for its children. Running the first
real fixture (a card containing a text node and a vector node) through the renderer and
reading the actual generated CSS output caught it immediately: `#node-frame-1`'s rule had
`position: absolute;` followed later by `position: relative;` — CSS keeps only the last
declaration for a given property, so the frame's own placement silently reverted to
default in-flow relative positioning, which would have visually broken every container
node's position the moment this was rendered in a real browser (not caught by a
type-checker or a naive "does it produce a string" test — only by reading the output).

**Fix:** Removed the redundant declaration entirely. `position: absolute` already
establishes a positioned-ancestor context for a node's own children (any CSS
`position: absolute | relative | fixed | sticky` value does) — there was never a need for
a second, conflicting declaration. `containerDeclarations` in `render-node.ts` now only
adds `overflow: hidden` (for `clipsContent`) on top of the shared geometry/style
declarations; the doc comment on `geometryDeclarations` (css-declarations.ts) was also
wrong in the same way (described the old, incorrect design) and corrected in the same
pass. Added a regression test (`render-document.test.ts`, "keeps a container's own
position: absolute intact") asserting the generated CSS rule for a container node
contains `position: absolute` and does not contain `position: relative`, so this exact
class of silent-override bug can't reappear unnoticed.

**Lesson:** A property that "sounds like it should be there" (a container "needs"
`position: relative`, by the common web-dev pattern of using it on a fixed parent so
absolutely-positioned children resolve against it) can be actively wrong once the actual
values in play are considered — here, the container itself was *already* absolutely
positioned, making the added declaration not just unnecessary but a same-property
override that silently discarded the correct value. The bug was only visible by rendering
a real fixture and reading the literal generated output, not by type-checking or running
an assertion that merely checked "did this produce non-empty HTML" — this is the renderer
equivalent of learning_v0.md's repeated theme (`001`/`006`/`012`/`018` etc.) that a design
built from reasoning about the shape of a problem, without checking real output, is a
hypothesis until verified against what actually comes out.
