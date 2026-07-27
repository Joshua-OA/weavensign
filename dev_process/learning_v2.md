# learning_v2.md — weavensign build log, continued (entries 019-023)

Continued from `learning_v1.md`. See `learning_v0.md`'s header for the versioning
scheme (each file ~200 lines, split at entry boundaries, never renumbered).

---

## 2026-07-07 (session 5 — first real eval fixtures, three more live-data schema bugs)

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

