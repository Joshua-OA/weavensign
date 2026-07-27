# learning_v4.md — weavensign build log, continued (entries 029-032)

Continued from `learning_v3.md`. See `learning_v0.md`'s header for the versioning
scheme (each file ~200 lines, split at entry boundaries, never renumbered).

---

## 2026-07-08 (session 6 — closing the `bool`-shape gap, third fixture, confirming the generalization gap)

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
equivalent of the log's repeated theme (`learning_v0.md` #001/#006, `learning_v1.md`
#012/#018, etc.) that a design
built from reasoning about the shape of a problem, without checking real output, is a
hypothesis until verified against what actually comes out.

### 031 — Closing the renderer's own known gaps: real data ruled out gradients/`height`/`truncate`, and surfaced a real missing-infrastructure blocker for image fills

**What happened:** Followed up on `030`'s scaffold by working through its three
documented gaps (image/gradient fills, text auto-resize, component-instance overrides),
starting the same way every fix in this log does — pulling real nodes from the eval
fixtures before writing anything. Two findings shaped scope directly: (1) grepping all
three eval fixtures for gradient fills found zero real examples (17 real `image` fills,
0 `gradient` fills) — per context.md §7's standing rule against building from a guess
when no real data exists to check it against (already applied to badges in `019`, avatars
in `022`/`023`, input-fields in `026`), gradients stay unrendered rather than guessing a
CSS `linear-gradient()` shape with nothing real to verify it against. (2) Inspecting a
real image-fill node found `assetRef` is Figma's raw internal image hash
(`paint.imageRef`, passed through unresolved by `adapters/figma/src/map-paint.ts`) — no
asset-fetch/resolution layer exists anywhere in the project (not in any adapter, not in
context.md's build order) to turn that hash into a fetchable URL. This isn't a renderer
gap at all; it's a missing upstream layer the renderer can't route around, flagged to the
user directly before writing any fill-rendering code rather than faking a broken `<img
src>` or guessing at a resolution scheme.

**Fix:** User chose a visible striped placeholder for image-only fills (a repeating
diagonal-gradient CSS pattern, clearly not attempting to show the real asset) over
silence or a fake URL. `styleDeclarations` (css-declarations.ts) now checks for an image
fill only when no solid fill is present, and applies `PLACEHOLDER_FILL_CSS` — kept
structurally separate from `GradientFillSchema` rendering so a future real asset-resolution
layer can replace just this one branch without touching gradient logic. For text
auto-resize, pulled a real `width-and-height` (hug-contents) node (`28:86`, "Home" nav
label) and a real `none` (fixed-box) node were both already covered — `height` and
`truncate` have zero real examples in any fixture, so left unmapped for the same "no real
data" reason as gradients. `textDeclarations` (new function, css-declarations.ts) swaps
`width`/`height` to `auto` only for `width-and-height`, leaving `none`'s existing fixed-px
behavior untouched. Two new fixture/golden pairs added
(`image-fill-placeholder`, `text-hug-contents`), both built from real eval-fixture nodes
(trimmed to compact standalone fixtures, values kept real/plausible rather than invented),
both schema-validated before use. `simple-card`'s existing golden output is byte-identical
after these changes (uses `autoResize: "none"`, confirming no regression) — checked, not
assumed.

**What was deliberately not done:** `ComponentNode`/`ComponentInstanceNode` rendering
distinction — the third gap from `030` — wasn't touched this pass; ran out of clearly-scoped
real-data-backed work to do on it without either guessing at what "override rendering"
should look like or needing the still-unresolved cross-file component reference gap
(`adapters/figma`'s README, referenced in `010`) resolved first. Left as an open gap,
not silently addressed.

**Lesson:** Two points, both reinforcing lessons already established elsewhere in this
log but now shown to apply at the renderer layer too. (1) "No real data exists for X" is
itself a valid, actionable finding — it's not a blocker to route around by inventing a
plausible-looking shape, it's a signal to explicitly scope X out and document why, the
same discipline `019`/`022`/`023`/`026` already established for the normalization layer.
(2) A "known gap" can turn out, on inspection, to not be a gap in *this* module at all —
image-fill rendering looked like a renderer task from `030`'s framing, but the real
blocker was a missing adapter/infrastructure layer several steps upstream; catching that
distinction before writing code (asking the user rather than quietly deciding "renderer
just can't do images") kept the fix scoped to what this module can actually own, and
named the real gap (asset resolution) in the right place instead of papering over it here.

### 032 — Smoke-testing the renderer against all three real eval fixtures: clean on first attempt, confirming `030`'s bug fix generalized

**What happened:** Golden-file tests only cover two small, hand-built fixtures — real
proof the renderer survives contact with large, previously-unexercised, real design-tool
output (the same check `011`/`012` ran for the adapters, and `022` ran for the
normalization heuristic) hadn't happened yet. Wrote `scripts/smoke-render.ts`, modeled
directly on `eval/run-heuristic.ts`'s existing pattern (a manual verification tool, not
part of `npm test`, run via `npx tsx`): loads every fixture in `/eval/fixtures`,
schema-validates it, renders it, and checks render time, output size, HTML tag balance
(`div`/`span`/`svg`/`path`/`style`/`head`/`body`/`html` open vs. close counts), and for
literal `undefined`/`NaN` strings leaking into output (a common symptom of an unhandled
`undefined` field silently stringifying instead of erroring).

**Result:** All three real fixtures (261/389/161 nodes — Figma e-commerce, Penpot
dashboard UI, Penpot pure-artwork) rendered cleanly on the first run: balanced tags, no
`undefined`/`NaN`, render time 7–17ms even for the largest tree. Manually inspected a
slice of the largest fixture's actual output (not just the pass/fail signal) to confirm
it wasn't a false-positive-shaped success: the root frame's rendered size (1512×3717)
matched the real page's known dimensions, nav-label text nodes correctly got
`width: auto; height: auto` (the real `28:86` "Home" node from `031`'s fixture, now seen
working at full-page scale, not just in isolation), and the real `8:10` image-fill node
rendered its striped placeholder at its true 1512×550 size rather than the trimmed
300×150 the standalone fixture used.

**Fix (tooling, not renderer logic):** The new script lives outside `src/` (`scripts/`),
which the package's `tsconfig.typecheck.json` didn't cover — adding `"scripts"` to its
`include` first hit `TS6059` (`rootDir` mismatch, since the base config's `rootDir: "src"`
is correct for the real `build` config but wrong for a `noEmit`-only typecheck pass that
also wants to cover non-emitted scripts); fixed by overriding `rootDir: "."` specifically
in `tsconfig.typecheck.json`, matching the same "typecheck config can differ from build
config" pattern the adapters' own `tsconfig.typecheck.json` files already established.

**Lesson:** A renderer built entirely from two small hand-crafted fixtures is a
hypothesis about "does this work on real design output" until it's actually run against
real output — same root lesson as `011`/`012`/`022`, now confirmed to hold at the
renderer layer as cleanly as it did at the adapter and normalization layers. Clean first
run isn't grounds to skip the manual inspection step, though — reading an actual slice of
real rendered output (not just trusting the balanced-tags/no-crash signal) is what
confirmed `030`'s position-override fix and `031`'s auto-resize/placeholder logic both
generalize correctly at full scale, not just in the small fixtures they were built and
tested against.

---

## 2026-07-10 (session, continued — step 6b, JSX/TSX renderer)

User chose to continue directly to the second renderer named in context.md §2's table
(JSX/TSX) rather than stop at HTML/CSS. Confirmed several design decisions with the user
before writing code, same discipline as the HTML/CSS renderer's kickoff: inline
`style={{...}}` objects (not CSS Modules), one flat function component per tree (not one
component per container node), and — once it became clear `css-declarations.ts`/
`format-value.ts` were fully format-agnostic (every value already a valid CSS-syntax
string, usable as-is in either a stylesheet rule or a React style object) — extracting
that logic into a new `/renderers/shared` package rather than duplicating or importing
one renderer from the other (the latter would have violated §4.3's declared-dependency
rule between sibling modules).

