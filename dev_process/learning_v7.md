# learning_v7.md — weavensign build log, continued (entries 047)

Continued from `learning_v6.md`. See `learning_v0.md`'s header for the versioning
scheme (each file ~200 lines, split at entry boundaries, never renumbered).

---

## 2026-07-26 (session — wiring renderers into the MCP server; `render_design`)

### 047 — Deliberately reversed the "mcp-server must never import /renderers" boundary once the actual goal (an MCP client renders real source, not just fetches data) made it wrong

**What happened:** User's real end goal is a client (Claude Code) fetching a design and
building it correctly from the AST in one flow, not fetching classified data and
re-deriving rendering logic itself each time. `mcp-server/README.md` had an explicit
"Must never import `/renderers`" rule from earlier in the project, written when renderers
were a separate, not-yet-built consumer of the schema. Rather than silently violating a
documented architectural boundary, named it to the user directly and confirmed the
boundary itself should move before writing any code — the same "ask before quietly
deciding" discipline `031`'s image-fill session already established, applied here to a
project-level architecture rule instead of a single gap. Added `render_design(nodes,
format)` as a fourth tool: takes the same `DesignNode[]` shape the fetch tools already
return, dispatches to whichever of the three renderer packages' `renderDocument`/
`renderComponent` matches `format`, returns the rendered source as **plain text**, not
JSON — a new `textToolResult` helper alongside the existing `jsonToolResult`, since
JSON-stringifying source code would have handed the client an escaped string to unescape
instead of source to write straight to a file.

Two real bugs surfaced while proving this end-to-end, both by actually running the build
from clean rather than trusting an incremental one: (1) root `package.json`'s
`workspaces` array listed `mcp-server` *before* `renderers/*`; `npm run build
--workspaces` runs in that literal array order, not dependency-topological order, so a
clean build (no stale `dist/` left over from a previous incremental build) failed with
"Cannot find module `@weavensign/renderer-html-css`" — an ordering bug that a warm
`node_modules`/`dist` from iterative development had been silently masking. Fixed by
moving `mcp-server` to the end of the array, after everything it depends on. (2) A fresh
`npm install` after adding the three renderer deps surfaced a *new* `brace-expansion`
high-severity advisory (via eslint's own `minimatch`/`@eslint/config-array` chain) that
hadn't been present at `046`'s audit — not caused by this change, just the registry's
advisory data moving since the last check. `typescript-eslint@8.65.1` already
peer-supports `eslint@^10.0.0`, so bumped `eslint`+`@eslint/js` to v10 without needing to
wait on a `typescript-eslint` major, re-ran the full lint suite clean, confirmed 2→7→2
vulnerabilities round-tripped back down.

Verified live, not just unit-tested: wrote a throwaway script using
`InMemoryTransport.createLinkedPair` (the same real-client-connection pattern
`create-server.test.ts` already established) to call `render_design` against the full
261-node `figma-ecommerce-landing` fixture for all three formats through an actual
connected MCP client, confirmed each returned real, correctly-shaped source
(`<!DOCTYPE html>...`, a Babel-generated `.tsx` component, a raw `<svg>` document) with
`isError: false` — then deleted the script; it was a one-time verification, not a
permanent addition.

**Lesson:** Two points. (1) An architectural "must never" rule is a snapshot of the
project's shape *at the time it was written*, not a permanent law — `010`'s "cross-file
components are the real gap" lesson already established that punch-list items can go
stale; this session shows the same is true of stated module boundaries, and the fix is
the same: re-verify against the actual current goal before either blindly obeying or
blindly violating the old rule, and make the change to the rule itself visible (updated
the README's "Must never import" section) rather than letting code and docs drift apart.
(2) `npm run build --workspaces --if-present`'s execution order being array-order, not
dependency-order, is exactly the kind of thing that only breaks on a *clean* build —
every local build during this project so far had a warm `dist/` from a previous
successful build, so `tsc`'s module resolution against `node_modules`'s already-built
`.d.ts` files never actually exercised the real npm-workspaces build sequence until this
session deliberately `rm -rf`'d every `dist/` first. The same "verify against a real,
previously-unexercised condition" discipline as `044`'s live pipeline run and `032`'s
full-fixture smoke test — this time applied to the build tooling itself, not the
application code.

### 048 — Bundling for npm publish hit three sequential failures; only a real run of the bundled binary surfaced any of them

**What happened:** Stage A of the distribution plan (publish `@weavensign/mcp-server` so
users can `npx` it without cloning the repo) switched the build from `tsc` to `tsup`,
inlining all workspace packages + SDK + zod into one self-contained bin. `tsc build
success` was meaningless here — three distinct runtime failures only appeared when
actually piping JSON-RPC into `dist/server.js`: (1) prettier is CommonJS, and bundling
CJS into ESM output converts its builtin `require()` calls into esbuild's throwing
"Dynamic require of ..." shim — first fix attempt (a `createRequire` banner in tsup)
collided with esbuild's *own* emitted `createRequire` import, and would have been wrong
even without the collision because banner bodies execute after hoisted imports evaluate,
while the breaking requires fire *during chunk initialization*; the working fix is
`src/cjs-shim.ts`, a side-effect module imported first by each entry — an import IS
guaranteed to evaluate before sibling chunks. (2) css-tree (prettier's CSS dep) loads
`../data/patch.json` via runtime `createRequire(import.meta.url)` relative to its own
package directory — invisible to any bundler transform, unfixable by config. (3) After
externalizing prettier, the same crash returned via a second route: svgo (renderer-svg's
dep) also depends on css-tree and dynamically loads its own plugins by name at runtime.

**Decision:** externalize exactly `prettier` + `svgo` as real dependencies of the
published package (they run from node_modules as designed), bundle everything else.
Also rejected two alternatives along the way: publishing all 8 workspaces to npm
(version-sync overhead every release) and keeping prettier external from the start
while bundling with a catch-all `noExternal: [/./]` — replaced with an explicit
allowlist (`BUNDLED_DEPS`) after the catch-all masked which package actually dragged
css-tree in.

**Lesson:** A bundler's success output verifies syntax, not behavior — the only real test
of a publish artifact is executing it (`printf '{...initialize...}' | node dist/server.js`
caught all three bugs in seconds). And dependency "size" surprises live one level deeper
than the direct dep: the problem was never prettier-the-package but css-tree's file-loading
design arriving through two independent routes, so grep the built output for module-path
comments (`// ../node_modules/...`) to trace who pulled what in before choosing what to
externalize.

### 049 — Token onboarding store: tolerance in the read path, loudness in the write path

**What happened:** Stage C+D of distribution: added `src/credentials.ts` (~/.weavensign/
credentials.json, dir 0700 / file 0600) and wired `resolveToken(service)` into both fetch
tools with env-var-first precedence. Two deliberate asymmetries: `readCredentials`
returns `{}` on missing/unreadable/corrupt JSON instead of throwing — the server must
never crash over local state, and a genuinely-missing token surfaces anyway as an
actionable missing-token tool error naming the setup command; `writeCredentials` throws
on fs errors because setup claiming "saved" when it wasn't is worse than crashing. One
small self-inflicted type bug: first draft typed `CredentialService = keyof Credentials`
("figmaToken"|"penpotToken") while every caller passes the logical service name
("figma"|"penpot") — caught by tsc before any runtime exposure; fixed by decoupling the
service-name union from the storage field names explicitly.

**Lesson:** Error-handling strictness should follow who can recover: an MCP server
reading optional local config recovers fine by degrading to "no token" (the client gets
a better message than a stack trace would give), while a CLI setup flow writing that
config has no meaningful recovery except failing loudly. Same codebase, opposite
policies, chosen per call site rather than applied as a blanket rule.

### 050 — One bin, two commands: dispatch on argv instead of registering multiple bins; readline's API bit twice

**What happened:** Stages B+E. The release workflow (tag-push publish) was uneventful.
The setup command hit two real issues: (1) first draft treated `rl.question` as
returning the answer string — it's callback-based and returns void; tsc caught it, but
the same misunderstanding shaped `askYesNo` and needed a promise-wrapper `ask()` helper
anyway. (2) A pty-driven end-to-end run exposed that when stdin closes mid-prompt, a
pending `question` promise never settles — the process exited **0** with no summary,
silently claiming success. Fixed with `settleOnClose`: one `rl.once("close")` guard
wrapping the whole interactive flow, rejecting so the CLI can print "Setup did not
complete" and exit 1. Also restructured packaging mid-stage: with multiple `bin`
entries, `npx @weavensign/mcp-server` cannot auto-resolve (npm requires a single bin or
one matching the unscoped package name), so the published package ships ONE bin
(`weavensign`) whose dispatcher routes `argv[2] === "setup"` to the setup flow via
dynamic import — `npx -y @weavensign/mcp-server` still boots the server untouched.

**Lesson:** Exit code is part of a CLI's error contract just as much as a Result type is
for library code (`§4.6`) — an unresolved promise that ends in a silent exit 0 is the
CLI equivalent of swallowing an error value. And npx bin-resolution rules are a real
packaging constraint worth checking before naming bins, not after: the multi-bin layout
looked cleaner but would have made the headline install command fail for every user.

### 051 — Adding a credential store silently broke test hermeticity; three smaller lessons followed

**What happened:** Stage F added tests for credentials/validation/interactive setup and
immediately surfaced that the EXISTING missing-token tests (`create-server.test.ts`)
had become non-hermetic: they delete FIGMA_TOKEN/PENPOT_TOKEN from env, but
`resolveToken` now falls back to the on-disk store — on any machine with a configured
`~/.weavensign/credentials.json`, those tests would have fired live API calls. Fixed by
pointing `WEAVENSIGN_CONFIG_DIR` at a throwaway temp dir inside the tests. Smaller ones:
tests writing a raw credentials file hit ENOENT because only `writeCredentials` creates
the directory; `configureService` had to be exported for direct testing (the interactive
loop is the valuable unit — `runSetup`'s TTY gate is not); and `vi.fn(async () => ({ok:
false,...}))` widens `ok` to `boolean`, breaking assignment to a discriminated-union
parameter type — an explicit return-type annotation on the mock fixes it. Masking itself
is verified by constructing readline with `terminal: true` over PassThrough streams so
the `_writeToOutput` echo path actually runs, then asserting the raw token never appears
in captured output while asterisks do.

**Lesson:** A new fallback path in shared code invalidates the assumptions of every
existing test that "proved absence" — env-var deletion no longer means token-less once
a second source exists. Hermeticity isn't a property you set once; each new input source
(env, disk, network) re-opens the question of what a test's environment really contains.

### 052 — The publish pipeline's real test is a stranger's machine: tarball → fresh install → run

**What happened:** Stage G (docs) and verification. Docs updates were uneventful. The
verification that mattered: `npm pack`, then install the tarball into an empty scratch
project (`npm init -y` + `npm install <tgz>`) and drive it exactly as an end user would
— `npx weavensign` for the tools/list handshake AND full render_design calls for all
three formats through the consumer's own node_modules. This is a strictly stronger check
than running dist/ inside the repo: inside the repo, hoisted workspace node_modules can
mask a broken dependency declaration (e.g., if prettier/svgo had been left out of
"dependencies", everything works locally and breaks only for real users). Consumer-mode
run confirmed both externalized deps resolve from the installer's tree. One ops note:
chaining typecheck+lint+test+build in one shell call tripped the 120s tool timeout even
though each step passes individually — cumulative CI-style runs need a larger budget,
not smaller steps.

**Lesson:** "Works from the repo root" and "works from npm" are different claims needing
different evidence; the tarball-in-a-scratch-dir test is cheap (~1 min) and is the only
one that exercises files/bin/dependencies metadata as more than decoration. Run it before
every first publish of a layout change.
