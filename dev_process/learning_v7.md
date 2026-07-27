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
