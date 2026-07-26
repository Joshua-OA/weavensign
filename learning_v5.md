# learning_v5.md — weavensign build log, continued (entries 033-039)

Continued from `learning_v4.md`. See `learning_v0.md`'s header for the versioning
scheme (each file ~200 lines, split at entry boundaries, never renumbered).

---

## 2026-07-10 (session, continued — step 6b, JSX/TSX renderer)

### 033 — Babel 8's latest packages need a newer Node than this repo commits to; caught before it became everyone's problem

**What happened:** context.md §3 names `@babel/types` + `@babel/generator` without a
version — installing the current `npm view` latest (`8.0.4` / `8.0.0`) produced a real
`npm warn EBADENGINE` on install: `@babel/helper-validator-identifier@8.0.4` requires
Node `^22.18.0 || >=24.11.0`, this machine runs `22.16.0`. The repo's root `package.json`
commits to `engines.node: ">=20"` for every contributor, not just this machine.

**Fix:** Asked the user rather than silently picking a resolution — same pattern as the
zod v3/v4 decision in `028`. Chose Babel 7.29.7 over bumping the repo's Node floor:
confirmed via a direct probe that 7.29.7's AST-builder API (`jsxElement`,
`objectExpression`, `jsxAttribute`, `jsxExpressionContainer`, etc.) is identical to 8.x
for everything this renderer needs, and 7.29.7 installs with zero engine warnings.

**Lesson:** "Latest" is not automatically the right version for a monorepo with a stated
engine commitment — same root lesson as `028`'s zod finding (a version bump's real floor
isn't visible from the package name alone, only from actually installing it and reading
what npm reports), but this time caught *before* committing to a version and writing
code against it, rather than after hitting a downstream typecheck failure.

### 034 — Extracting renderer-shared: a real cross-cutting refactor, verified with the existing renderer's golden tests before trusting it

**What happened:** Moved `css-declarations.ts` and `format-value.ts` (plus their now
newly-written direct unit tests — previously only covered indirectly through
`renderer-html-css`'s golden-file tests) into a new `@weavensign/renderer-shared`
package, and updated every `renderer-html-css` file that imported them
(`render-node.ts`, `render-svg-vector.ts`, `render-text.ts`, `stringify-css.ts`,
`index.ts`) to import from the new package instead. Fixtures (`simple-card`,
`image-fill-placeholder`, `text-hug-contents` — all built from real eval-fixture nodes
per `031`) moved alongside them into `renderers/shared/fixtures`, since both renderers
need the identical `DesignNode[]` inputs and a second copy would risk silent drift, same
reasoning §4.5 already applies to third-party dependency duplication.

**Verification, not assumption:** After the move, re-ran `renderer-html-css`'s full test
suite (9 golden-file/determinism tests) and its real-fixture smoke script — both produced
byte-identical output to before the extraction, confirming the refactor was a pure move
with zero behavior change, not just "it compiles." This is the same discipline `020`/
`023`/`025` established for heuristic changes (rescore every existing fixture before
trusting a generalization) applied to a structural refactor instead of a logic change.

**Lesson:** A refactor that moves code without changing it still needs the same
"prove it, don't assume it" verification as a change that does — the risk isn't that the
logic is wrong (it's the same functions, unmodified), it's that the move itself
introduces a wiring mistake (wrong import path, missed call site, build-order issue
between the new package and its consumer). Re-running the *existing* golden tests after
the move is what actually proves that didn't happen; a clean typecheck alone only proves
the types line up, not that the runtime behavior is unchanged.

### 035 — A real crash while generating this renderer's own golden fixtures: raw JSX text can't contain a bare `<`

**What happened:** Running the golden-fixture-generation script against the `simple-card`
fixture (the same one already used for `renderer-html-css`, containing the text
"Hello & \<world\>" specifically because it exercises HTML-escaping) crashed inside
Prettier's parser: `SyntaxError: Unterminated JSX contents`. Root cause: `render-text.ts`'s
`renderRunSpan` used `t.jsxText(run.characters)` to place the run's raw string directly as
JSX child content — but JSX text nodes treat a bare `<` (and `{`, and `&`) as syntactically
significant, so a literal `<` in real text breaks parsing entirely, the JSX equivalent of
`renderer-html-css`'s `escapeHtml` requirement but manifesting as a hard parse failure
instead of a silently-wrong-but-valid HTML string.

**Fix:** Switched to `t.jsxExpressionContainer(t.stringLiteral(run.characters))` — a JS
string literal has none of JSX-text's special-character restrictions (only ordinary JS
string-escaping rules apply, which Babel's generator already handles correctly for any
input), so wrapping text content in `{"..."}` sidesteps the whole class of problem rather
than needing a JSX-specific escaping function to parallel `escapeHtml`. Re-ran the
golden-fixture generation after the fix — all three fixtures (including the one that had
just crashed) produced clean, valid output on the retry.

**Lesson:** The exact fixture chosen specifically to exercise `renderer-html-css`'s
escaping logic (`018`-era discipline: test the thing that's likely to break, not just the
happy path) did its job again here, on a completely different renderer, for a
structurally different reason (JSX-text parse failure vs. HTML-escaping correctness) —
worth noting as a case where reusing a fixture built for one renderer's known-tricky case
paid off immediately for a second renderer built later, without needing to separately
discover that JSX has its own version of the same underlying problem (arbitrary user text
colliding with the output format's own special characters).

### 036 — Second renderer's real-fixture smoke test: clean on first run, confirming the shared-package extraction and JSX fix both generalize

**What happened:** Built `scripts/smoke-render.ts` for `renderer-jsx-tsx`, mirroring
`renderer-html-css`'s smoke-test pattern exactly (`032`) — ran `renderComponent` against
all three real eval fixtures (261/389/161 nodes). All three rendered cleanly on the first
attempt: no crashes, no `undefined`/`NaN`, render time 70–246ms (slower than the HTML
renderer's 7–17ms, since Prettier formatting is heavier than postcss stringification, but
still well within one-shot-render territory). Manually inspected a slice of the largest
fixture's actual output again (not just the pass signal, same discipline as `032`):
confirmed real page dimensions, hug-contents text, and the image-fill placeholder all
match the HTML renderer's output structurally, and — specifically checking that `035`'s
fix generalized past the one fixture that surfaced it — counted 70 real string-literal
text spans (`{"..."}`) in the full page's output, confirming every text run in a
261-node real page round-trips through the string-literal path without incident, not
just the one "Hello & \<world\>" case that happened to crash first.

**Lesson:** Same conclusion as `032`, now doubly confirmed: a clean smoke-test run
against real, previously-unexercised data is worth demanding from every renderer before
calling it done, not just the first one built. Nothing here was a new finding — it's the
verification step that turns "the code looks right and the small fixtures pass" into an
actual claim about real-world behavior, for a second renderer just as much as the first.

---

## 2026-07-10 (session, continued — step 6c, SVG renderer, closing step 6)

Third and final renderer named in context.md §1/§3/§5 (HTML/CSS and JSX/TSX already
done). Confirmed scope with the user first: one `DesignNode[]` tree → one self-contained
`<svg>` document, same "whole tree in, one output out" shape as the other two, not a
narrower "export individual vector nodes" tool.

### 037 — SVG's coordinate and paint models are different enough from CSS that reusing renderer-shared's CSS-declaration logic would have been the wrong call

**What happened:** Before writing any mapping code, checked whether `renderer-shared`'s
`css-declarations.ts` (already reused as-is by both HTML/CSS and JSX/TSX) would serve a
third time. It wouldn't, for two real structural reasons, not just "different syntax":
(1) SVG has no `position: absolute` concept — its native composition model is nesting
plus `transform="translate(x, y)"`, so `geometryDeclarations`'s entire
`position/left/top` output has no SVG equivalent to map onto, not even a renamed one;
(2) SVG paints via presentation attributes on shapes (`fill`, `stroke`, `rx`) with a
different initial-value model than CSS — critically, SVG's `fill` defaults to *black*
when omitted, where CSS `background-color` defaults to transparent, so `styleDeclarations`'s
"only emit background-color if a solid fill exists, otherwise omit the property entirely"
pattern would silently paint every unfilled SVG shape solid black if copied over
unchanged. Only `format-value.ts`'s `formatColor`/`formatNumber` (genuinely
format-agnostic number/color rounding, no CSS-specific assumptions) carried over.

**Fix:** Wrote `svg-attributes.ts` from scratch for this renderer, with an explicit
`fill="none"` fallback for the no-fill case (verified against the real SVG spec, not
assumed) instead of omitting the attribute. `render-node.ts`/`render-vector.ts` use
`transform="translate(...)"` nesting throughout instead of any positioning declaration
list at all.

**Lesson:** "Two renderers already share this logic, so the third one probably should
too" is exactly the kind of assumption context.md's whole build history argues against
making without checking real behavior first (same root pattern as `008`: two things that
look like "the same kind of thing" — an SVG shape's fill and a CSS box's background — can
have genuinely different semantics, here specifically an initial-value default that
would have caused a real, silent rendering bug (solid black shapes) if the CSS-shaped
function had been reused unchanged. `renderer-shared`'s own README already scopes it as
"format-agnostic mapping... into a list of CSS declarations" — SVG attributes were never
actually in scope, and confirming that before writing code (rather than after hitting a
bug) is what kept the black-fill mistake from ever shipping.

### 038 — SVG has no equivalent for two real behaviors the other renderers already handle: text auto-resize and exact text-baseline position

**What happened:** Two real gaps surfaced while mapping `TextContent`/`TextStyle` to
SVG, neither fixable by "map it like the other renderers did." (1) SVG's `<text>` `y`
coordinate is baseline-anchored; the schema's `Geometry` is box-top-anchored (same
convention the HTML/JSX renderers' `top`/`height` boxes use) and carries no real
font-metrics field (no ascent/descent/baseline — checked `typography.ts` directly,
confirmed absent, not assumed missing) to convert exactly between the two. (2)
`TextContent.autoResize`'s `width-and-height` (hug contents) maps to CSS `width: auto;
height: auto` in the other two renderers — SVG's `viewBox` has no equivalent mechanism to
size itself to rendered text content without an actual layout engine computing it first.

**Fix:** (1) Approximated the baseline offset as `fontSizePx * 0.8`, documented explicitly
in `BASELINE_RATIO`'s doc comment as an approximation with no real font-metrics backing
it — not presented as if it were as precise as the geometry-derived values elsewhere in
this renderer. (2) Left `autoResize` completely unmapped for this renderer specifically
(every text node uses its fixed source geometry, `none` and `width-and-height` alike) —
a real, documented behavioral difference from the HTML/JSX renderers' partial `autoResize`
support, not silently identical treatment.

**Lesson:** Not every gap between renderers targeting the same canonical schema is a bug
to be closed with more real data — some are genuine differences in what the target
format is capable of expressing at all. `031`'s "no real data exists for X" pattern (skip
it, document why) covers gaps caused by *missing information*; this is a different
category, gaps caused by the *output format itself having no mechanism* for a concept the
schema and the other renderers do support — worth distinguishing the two in each
renderer's README so a future reader doesn't mistake "SVG can't do this" for "nobody's
gotten around to it yet."

### 039 — SVG renderer's real-fixture smoke test caught one real gap (cornerRadius unmapped) before it shipped

**What happened:** Same discipline as `032`/`036` — before calling the renderer done, ran
it against the `simple-card` fixture (a card with `cornerRadius: 8`) and actually read the
output, not just checked it didn't crash. The rendered `<rect>` had no `rx` attribute at
all — `render-node.ts`'s `renderContainerBackground` built the background rect from
`width`/`height`/fill attributes only, never read `style.cornerRadius`, an omission that
would have silently dropped every rounded-corner container's rounding in SVG output while
the other two renderers preserved it correctly.

**Fix:** Added an `rx` attribute (SVG's corner-radius equivalent) sourced from
`style.cornerRadius`, only emitted when the field is present — mirrors the other
renderers' "only emit non-default declarations" pattern. Re-ran the fixture; `rx="8"`
now present in the output, and svgo left the `<rect>` un-flattened once `rx` made it
non-trivial to collapse to a bare `<path>` (an incidental confirmation that svgo's
optimization behavior is itself sensitive to which attributes are present — another
reason `render-document.ts` pins an exact svgo version rather than tracking latest, since
a future svgo release changing its flattening heuristics could silently change output
shape for reasons having nothing to do with this renderer's own code).

**Lesson:** Same conclusion as `032`/`036`, holding for the third time running: manually
reading a real render's actual output — not just trusting "it ran without throwing" — is
what catches an omitted field that a type-checker has no way to flag (missing an
optional-field read isn't a type error) and that a crash-only smoke test would never
surface either, since a rounded rect rendering as a square rect is a silent correctness
bug, not a thrown exception.

Step 6 (renderers) is now complete per context.md §1/§3/§5's three named formats
(HTML/CSS, JSX/TSX, SVG) — all three share `renderer-shared`'s number/color formatting
(and, where applicable, CSS declarations), all three pass golden-file + determinism
tests, all three have been smoke-tested against real, previously-unexercised design data
with manually-verified output, and all three document their real known gaps rather than
silently guessing at unmapped cases.

---

## 2026-07-16 (session — closing the image-fill asset-resolution gap)

Picked up the biggest concretely-scoped open item flagged across every renderer's
"known gaps" section since `031`: `assetRef` was always Figma's raw opaque image hash,
with no layer anywhere in the project to turn it into a real, fetchable URL. Confirmed
scope with the user before writing anything: a new pure `resolveImageFills` function in
`@weavensign/adapter-figma`, called by `mcp-server` after `parseFigmaNodes`, substituting
real URLs into the tree before returning it — renderers detect "resolved" by checking
whether `assetRef` looks like a URL, no new schema field, no version bump.

