# learning_v1.md — weavensign build log, continued (entries 011-018)

Continued from `learning_v0.md`. See `learning_v0.md`'s header for the versioning
scheme (each file ~200 lines, split at entry boundaries, never renumbered).

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

