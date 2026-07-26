# learning_v6.md — weavensign build log, continued (entries 040-046)

Continued from `learning_v5.md`. See `learning_v0.md`'s header for the versioning
scheme (each file ~200 lines, split at entry boundaries, never renumbered).

---

## 2026-07-16 (session — closing the image-fill asset-resolution gap)

### 040 — Confirmed the real Figma endpoint live before writing any code, and it wasn't the one guessed at first

**What happened:** First instinct was `GET /v1/images/:key?ids=...` — tried it live
against the real file already used throughout this project's fixtures, and it worked,
but resolves a *node id* to a rendered export image of that node, a completely different
operation (render this node as a PNG) from what was needed (resolve *this specific
image-fill asset's hash* to its own URL). Caught immediately by reading what the
response actually contained, not by assuming the first endpoint that returned 200 must
be the right one. The real endpoint is `GET /v1/files/:key/images`, returning
`meta.images: { [imageRef]: url | null }` — verified live against the same real file,
confirmed the fixture's actual `assetRef` (`25f24886b60bef4d77ebf1a1658997bb75772fb7`,
same node used throughout `031`/`037`-`039`) resolves to a real signed S3 URL through it.

**Lesson:** Same root lesson as `002` (Figma's design-context MCP tools aren't a
substitute for the real REST API being adapted) at one level of granularity deeper — even
within "the real REST API," two different endpoints can both return 200 and both look
plausible from the URL shape alone (`/v1/images/...` vs `/v1/files/.../images` are one
character apart), and only reading what the response actually contains catches picking
the wrong one. A live curl call before writing adapter code is cheap; a wrong assumption
baked into a whole resolution layer is not.

### 041 — Signed URLs expire; fixtures built from a live response would have been a ticking time bomb

**What happened:** The real images-endpoint response carries `Expires=<unix-timestamp>`
signed S3 URLs — real, working right now, but not permanent. A fixture built by saving
that live response directly (the obvious first move) would pass every test today and
start failing silently whenever the signature window lapses, without any code change
having happened — a determinism/staleness bug baked into the test suite itself, not the
renderer.

**Fix:** Built `adapters/figma/fixtures/raw/image-fills-response.json` by hand instead —
same real shape (real `imageRef` values pulled from the live response, including the
exact hash used throughout `031`'s fixtures), but with stable, fake, non-expiring URLs
standing in for the real signed ones, plus one explicit `null` case (Figma's documented
behavior for an unresolvable ref — confirmed via docs, not present in the live sample
of 99 real refs, same "verify against docs even when a sample doesn't show it" discipline
as `006`/`012`).

**Lesson:** Not every "capture a real response as a fixture" instinct (the pattern this
whole project has followed since `001`) is safe to apply unchanged — a response
containing time-limited credentials or signed URLs needs the *shape* captured and the
*values* replaced with stable stand-ins, or the fixture silently rots on a timer no test
run would ever surface until the exact moment it broke in production-like use.

### 042 — Graceful degradation, decided with the user rather than assumed: a failed second API call must not fail an otherwise-successful tool call

**What happened:** `get_figma_design` now makes a second live call (image-fill
resolution) after the primary node fetch/parse already succeeded. Asked the user
directly rather than picking silently: if that second call fails (bad token scope, rate
limit, transient network error), should the whole tool call fail, or should the
already-good `DesignNode[]` data still be returned with unresolved (placeholder-
rendering) image fills?

**Fix:** User chose graceful degradation. Implemented as: check whether the parsed tree
has any image fill at all before making the second call (skips an unnecessary network
round-trip for the common case of no image fills); if it does and the resolution call
fails, return the already-parsed nodes unchanged rather than erroring. Unit-tested all
three paths directly against `getFigmaDesign` with a mocked `fetch` (no live network
call in tests, per context.md §4.8) — exactly one fetch call when no image fill exists,
exactly two when one does, and a failing second call still returning success with the
original hash intact.

**Lesson:** This is context.md §4.6's "routine failures are values, not exceptions" rule
applied to a *design* decision, not just an implementation one — "what should this
function do when call #2 fails after call #1 succeeded" has more than one defensible
answer (fail loud vs. degrade gracefully), and which one is right depends on how the
caller will actually use the result, a product decision the user is positioned to make
correctly and I'm not entitled to guess at silently.

### 043 — Real fixture data, not assumption, decided the CSS `background-size`/SVG `preserveAspectRatio` mapping — and caught a second scaleMode collision in the same session

**What happened:** `ImageFillSchema.scaleMode` has five members
(`fill`/`fit`/`crop`/`tile`/`stretch`); before writing any CSS/SVG mapping, re-checked
the real eval fixture's actual distribution (same query already run once in `031`,
re-run to confirm it still held): 11 `fill`, 5 `stretch`, 1 `tile`, zero `fit`/`crop`.
Mapped only the three with real coverage to real CSS (`background-size: 100% 100%` for
stretch, `background-size: auto` + `background-repeat: repeat` for tile, `cover` for
fill) and SVG (`preserveAspectRatio="none"` for stretch, `"xMidYMid slice"` for
fill/tile), falling `fit`/`crop` back to `fill`'s treatment rather than inventing an
untested shape for either — same rule as every prior "no real data, don't guess" call in
this log.

**Fix:** While wiring the JSX/TSX renderer's `style-object.ts` to pick up the two new
properties (`background-size`, `background-repeat`), the *actual* fix needed was
unrelated to scaleMode itself: that renderer's kebab→camelCase conversion was a
hand-maintained lookup table (`CSS_PROP_TO_JS_PROP`) that had simply never been updated
for these two new property names, so it silently emitted bracket-quoted kebab-case keys
(`"background-size": "..."`) instead of `backgroundSize: "..."` — caught by generating
this exact fixture's golden output and reading it, not by any test that existed before
this session. Replaced the lookup table entirely with a generic regex conversion
(`cssProp.replace(/-([a-z])/g, ...)`) — confirmed byte-identical output against every
existing golden file first, so the replacement was proven safe before being trusted.

**Lesson:** Two points. (1) A hand-maintained property-name lookup table is exactly the
kind of hidden coupling this log has warned about before in other forms (`005`'s
package-version/content-version pair, `linked constants must move together`) — every
property `renderer-shared` can ever emit has to be remembered and added to a second
file's table, and nothing enforces that link; a general conversion rule has no such
maintenance surface at all. (2) Fixing one gap (image-fill resolution) surfaced a second,
unrelated latent bug in a completely different renderer, simply because it was the first
time these two specific CSS properties had ever been exercised end-to-end — reinforcing,
again, why every fixture addition in this project gets run through the real renderer and
read, not just typechecked.

### 044 — Full pipeline verified live, end-to-end, against the real Figma file used throughout this project

**What happened:** Before calling this done, ran the actual live sequence once with a
real token: `fetchFigmaNodes` → `parseFigmaNodes` → `fetchFigmaImageFills` →
`resolveImageFills` → `renderDocument`, against the same real file/node
(`CdaToBlYGY4iIa2WuGn7Dh` / `8:10`) used as the source for `031`'s original
`image-fill-placeholder` fixture. Confirmed at every stage: the raw parsed node carries
the original opaque hash; after resolution, the same node carries a real signed
`s3-alpha-sig.figma.com` URL; the rendered CSS rule contains a correct
`background-image: url(...)` with `background-size: 100% 100%` (this node's real
`scaleMode` is `stretch`).

**Lesson:** Unit tests with mocked fetches (per `042`) prove the code's logic is correct
in isolation; they don't prove the real Figma API still returns what the mocks assume it
returns, or that the three packages (adapter, mcp-server, renderer) actually compose
correctly when wired together for real. Same "verify against live, previously-unexercised
reality before calling it done" discipline as every adapter session in this log
(`011`/`012`, most directly) — worth running once at the end of a feature that spans
multiple packages, even when every individual package's own test suite is green,
because green unit tests only prove each piece works alone.

---

## 2026-07-22 (session — human-reviewing eval labels, then re-checking the component-instance-override punch-list item)

### 045 — The "component-instance overrides don't render" punch-list item was stale; the real, narrower gap is cross-file component resolution, and it was already undocumented rather than unhandled

**What happened:** Standing punch list carried "component-instance overrides don't render
— instance customization invisible in all 3 renderers, blocked on Figma adapter's
cross-file component gap (learning_v0.md `010`)" as a known-broken item. Before starting any fix, checked
whether it was still true. It wasn't: `schema/src/nodes.ts`'s `ComponentInstanceNode`
already carries a resolved `overrides` field plus the instance's own real `children` tree;
`map-node.ts`'s `INSTANCE` case already builds that `children` array from the raw node's
actual (already-override-applied) subtree, exactly as Figma's REST API returns it — Figma
serves each instance's real content directly, not a diff against the component
definition, so there was never a second resolution step to write. All three renderers'
`render-node.ts` already treat `component-instance` identically to `frame`/`group`
(render own style + full children recursively). Pulled the real `figma-ecommerce-landing`
fixture's 8 component-instance nodes, found one (`225:297`, variant `"Hovered"`) with a
genuinely different child structure and fill than the other four (`"Default"` variant,
same `componentKey`) sharing the same base component, rendered the whole fixture through
`renderer-html-css`, and confirmed the two instances' CSS rules differ exactly as their
source data does (`225:297` has no `background-color`; `189:161` does) — real proof, not
inference from reading the code. The only actual unhandled case is `INSTANCE.componentId`
resolving to a component defined in a *different* file (a shared library) than the one
being parsed — `map-node.ts` already returns a `Result` error
(`unresolved-component-reference`) for that case rather than crashing or guessing, it just
wasn't listed in `adapters/figma/README.md`'s "Known gaps" section, so nothing surfaced it
as intentional, tracked, already-safe behavior. Added it there.

**Lesson:** A punch-list entry written while a real blocker was still upstream (image-fill
resolution, closed in the prior session) can go stale without anyone updating it — the
entry described the *shape* of a plausible gap correctly (cross-file components are
involved) but was wrong about *where* the gap actually was (adapter error-handling
correctness, not renderer override logic) once the actual code was read end-to-end instead
of re-trusted from memory. Before starting work on any "known gap," re-verify it's still a
gap with real fixture data and an actual render, the same discipline `031`'s "no real data
exists for X" lesson already established — it applies just as much to *closing* a punch-list
item as to opening one. A "known gap" that fails safe (`Result` error) but is undocumented
is a documentation bug, not a functionality bug — worth fixing, but a much smaller and
different fix than the punch list implied.

### 046 — Adding the first CI gate found `npm run lint` was broken repo-wide, and typechecking `apply-review.ts` found a real type-contract gap

**What happened:** Punch list's last open item was "no CI/dependency-audit/security-review
gate exercised yet." Before writing a workflow file, ran every script CI would call
(`build`, `typecheck`, `lint`, `test`, `npm audit`) locally first — the same "verify before
trusting" discipline as every other session in this log, applied to infrastructure instead
of application code. Two real, pre-existing problems surfaced immediately, both by running
the scripts rather than reading them: (1) four `package.json`s (`schema`, both adapters,
`normalization`) declared `"lint": "eslint src"` but eslint was never installed and no
config existed anywhere in the repo — `npm run lint` failed with `eslint: command not
found` on every one of them, meaning "lint" had silently never actually run, possibly since
whichever commit first added those scripts. (2) `npm run typecheck` failed on
`eval/apply-review.ts` (added last session, `cf4ce39`): `RoleAssignment` requires a
`confidence: number` field, but ground-truth label files (`eval/labels/*.json`, human-
authored) never had one, and `apply-review.ts`'s merged output — a real construction site,
not just a read — correctly tripped the compiler on the missing field. Grepped for
`.confidence` across the whole normalization/eval surface and found it's consumed nowhere
today; only `classify-node.ts`'s three classifier calls actually populate it (real
heuristic predictions, which do need a confidence score). Made `confidence` optional on
the interface — ground truth isn't a probability estimate, there was never a real value to
put there — rather than fabricating a placeholder number to satisfy the compiler.

Fixed (1) by installing `eslint` + `typescript-eslint` as root devDependencies and adding
one flat `eslint.config.mjs` (not `.js` — avoids a `MODULE_TYPELESS_PACKAGE_JSON` perf
warning without touching root `package.json`'s module type, which other root-level scripts
like `fetch-figma-live.ts` didn't need changed). Running the now-real lint caught one
genuine dead import (`RawTransform` in `adapters/penpot/src/map-geometry.ts`) — a real, if
tiny, finding from a gate that had never actually run before.

`npm audit` separately found 7 vulnerabilities, all transitive (`@modelcontextprotocol/sdk`
→ `@hono/node-server`; `vitest`/`vite` → `esbuild`). `npm audit fix` (non-breaking) cleared
the `fast-uri` one. The rest needed a real major-version bump — asked the user rather than
force-fixing blind, since `npm audit fix --force` would have also silently downgraded the
actual MCP SDK to clear the Hono chain, a functional regression disguised as a security
fix. User approved fixing the dev-tooling chain (vitest 2→4 across all 10 workspaces) to
get CI's audit gate green today, while leaving the SDK's own Hono dependency (Windows-only
path-traversal, moderate, no forced downgrade) as a tracked, accepted gap rather than
breaking the real runtime dependency to satisfy the gate. Full test suite (112 tests) still
passed after the vitest bump — checked, not assumed a major version bump is safe.

Before trusting the workflow file itself, copied the whole repo to a scratch directory,
deleted every `node_modules`, ran `npm ci` (proving the lockfile alone reproduces the same
install CI would get, not "install after already having a warm node_modules") and then the
exact sequence the workflow runs — build, typecheck, lint, test, `npm audit
--audit-level=critical` — confirming every step exits 0 in a clean environment before
writing that claim down anywhere.

**Lesson:** Three points. (1) A script existing in `package.json` proves nothing about
whether it has ever successfully run — `lint` had been silently broken long enough that no
one noticed, because nothing was gating on it; the first real value of adding a CI gate was
finding out the repo's *existing* scripts didn't actually work, before ever getting to new
checks. (2) Writing a construction site against a type (not just reading through it) is
what makes a strict type system earn its keep — `score.ts`'s existing `JSON.parse(...) as
RoleAssignment[]` cast had papered over the same missing-`confidence` gap for as long as
labels files existed, because casts on a *read* never get checked against the literal
shape; only `apply-review.ts`'s object-literal *construction* forced the compiler to look.
(3) A security/dependency gate should never be satisfied by force-fixing blind — `npm audit
fix --force`'s own output named the exact regression (a real SDK downgrade) before it was
run, and reading that output before running it is what caught it; the fix that makes a gate
green has to be evaluated on its own merits, the same as any other change, not treated as
automatically safe because a security tool suggested it.

---

## 2026-07-26 (session — wiring renderers into the MCP server; `render_design`)

