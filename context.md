# context.md — weavensign

This file is the standing reference for anyone (human or AI coding agent) working on
this repository. Read it before writing code. If a change conflicts with this file,
the change is wrong or this file is out of date — fix whichever is true, don't ignore it.

---

## 1. What is being built

**weavensign** is an open-source canonical schema, MCP server, and set of adapters and
renderers that let AI tools read and edit *any* design source through one typed,
structured tree — instead of guessing from screenshots or hand-writing SVG coordinates.

Three parts, in order of how certain the design is:

1. **Adapters** — mechanical translation from a real design source (Figma, Penpot) into
   the canonical schema. No inference. Pure mapping.
2. **Normalization layer** — resolves semantic role (this shape is a *button*, this
   group is a *repeated card*) from inconsistent authoring. This is the hard,
   differentiated part. Heuristics first, ML/LLM escalation for ambiguous cases only.
3. **Renderers** — deterministic, pure functions from the canonical schema to code
   (HTML/CSS, JSX/TSX, SVG). No AI in this step. Same input must always produce the
   same output, byte for byte.

Everything downstream (raster tracing, generative photo-to-primitive decomposition, the
reconciler) is a separate track, built later, against a normalization layer that's
already proven trustworthy on structured input.

---

## 2. Build order — do not skip ahead

| # | Step | Depends on | Done when |
|---|------|-----------|-----------|
| 1 | Canonical schema | — | Zod schema + generated types cover frame/group/text/vector/component nodes; versioned |
| 2 | Figma adapter | 1 | Round-trips a real Figma file into schema with no data loss on geometry/style |
| 3 | Penpot adapter | 1 | Same, against Penpot's API |
| 4 | Normalization layer | 2, 3 | Scores ≥ an agreed precision/recall bar against the hand-labeled eval set (§7) |
| 5 | MCP server | 1–4 | Tools listed and callable via MCP Inspector over stdio |
| 6 | Renderers (HTML/CSS, then JSX/TSX) | 1, 4 | Golden-file tests pass; output is stable across repeated runs |
| — | Reconciler | schema is stable | *Deferred — do not start until schema stops changing weekly* |
| — | Raster tracer / generative pipeline | 4 | *Deferred — separate track, own module, own repo folder* |

Do not build renderers before the schema is stable. Do not build the reconciler before
the renderers exist. Do not touch raster/generative work before normalization is proven
on structured input. Sequencing violations are the most expensive mistake on this
project — see prior discussion of why.

---

## 3. Tech stack

- **Core (schema, adapters, normalization heuristics, MCP server, renderers): TypeScript.**
  Renderers target JS-ecosystem output (JSX/TSX, HTML/CSS) — no reason to leave that
  ecosystem to produce it.
- **MCP: official `@modelcontextprotocol/sdk`, v1.x** (not the v2 beta — track it, don't
  build on it yet). Local dev over `stdio`; remote/multi-user later over Streamable HTTP.
- **Schema: Zod.** One definition, runtime validation and static types both derived
  from it. Never hand-maintain a parallel TS `interface` next to a Zod schema.
- **JSX/TSX codegen: `@babel/types` + `@babel/generator`**, not string templates.
  Output always syntactically valid; pipe through Prettier for formatting.
- **CSS codegen: `postcss`.** SVG: string/XML build, then `svgo` as a cleanup pass.
- **ML sidecar (later, normalization escalation + raster/generative tracks): Python.**
  Called from the TS core as an isolated subprocess or internal service — never
  imported directly, never allowed to leak its dependencies into the core's install.

---

## 4. Non-negotiable engineering rules

### 4.1 Type safety
- `tsconfig.json`: `"strict": true`, `noUncheckedIndexedAccess: true`, no implicit `any`.
- `any` is banned. If the type is genuinely unknown (e.g. a freshly-parsed external API
  response), it's `unknown`, narrowed explicitly before use.
- Every schema node type is a **discriminated union** on a `type` field. Every `switch`
  over that field must be exhaustive — use a `assertNever(x: never)` helper at the
  default case so an unhandled node type is a compile error, not a runtime surprise.
- Type assertions (`as`) are allowed only at trust boundaries (parsing raw JSON from
  Figma/Penpot), and every one must sit next to a comment explaining why it's safe.

### 4.2 No functions inside functions
Nested function declarations are banned. Every function is a named, top-level export
(or a class method) in its module, even if it's only called once.

```ts
// ❌ don't do this
function renderCard(node: DesignNode) {
  function extractTitle(n: DesignNode) { /* ... */ }   // hidden, untestable, unreadable
  return extractTitle(node);
}

// ✅ do this
function extractTitle(node: DesignNode): string { /* ... */ }
function renderCard(node: DesignNode): string {
  return extractTitle(node);
}
```
Reason: a nested function can't be unit-tested in isolation, its closure captures state
invisibly, and it makes stack traces and file search useless. Extraction costs nothing
and buys testability for free.

### 4.3 Modularity and file size
- **Soft ceiling: ~250–300 lines per file.** Hitting it is a signal to split, not a hard
  rule to game with fewer blank lines.
- One exported concern per file: one adapter, one renderer, one schema domain. If a
  file needs a "and also" in its description, split it.
- `index.ts` files only re-export. No logic lives in an index file, ever.
- A module may only import from the modules it's declared to depend on (§2 table).
  Renderers never import adapter code. Adapters never import renderer code. Everything
  passes through the canonical schema — that's the entire point of having one.

### 4.4 Memory discipline
- Design files can be large (thousands of nodes). Map an adapter's raw API response
  into the canonical schema once, then **drop the reference to the raw response** —
  don't keep both trees alive for the life of the request.
- No unbounded in-memory caches. Anything cached gets an explicit size cap (LRU) and a
  TTL. "It'll be fine, files are usually small" is not a cap.
- The MCP server is long-running. Anything registered per-request (listeners,
  timers, subscriptions) must be explicitly torn down — a server that leaks a small
  amount per request is a server that falls over in a week, not a day, which is worse
  because it's harder to catch in testing.
- Prefer structural sharing over deep-cloning large trees. Only reach for an
  immutability helper library if plain object spreads are actually causing bugs, not
  preemptively.

### 4.5 Dependency discipline
- Lockfile is committed and enforced in CI (`npm ci`, never `npm install`, in pipelines).
- One library per concern, no duplicates competing for the same job (one JS-AST tool,
  one CSS-AST tool, one validation library). Adding a second one for the same job needs
  a written reason, not a preference.
- Pin exact versions for anything that touches renderer output — a transitive
  dependency's patch release silently changing generated code output is a determinism
  bug, not a minor version bump.
- Run dependency audits regularly. The MCP ecosystem specifically has had real supply
  chain findings in third-party servers — treat every new dependency as something that
  runs with the same privileges as your own code, because it does.
- Before adding a dependency for something trivial (a dozen lines of logic), write the
  dozen lines instead.

### 4.6 Error handling
- Expected, routine failures (a network call fails, an API token is invalid, a design
  file has a node type the adapter doesn't recognize yet) are **values, not
  exceptions** — model them as a `Result<T, E>`-style union and force the caller to
  handle both branches.
- Reserve `throw` for genuinely unexpected, programmer-error conditions.
- No empty `catch` blocks. If a failure is truly ignorable, the catch block says so in
  a comment, explicitly, next to the empty handler.

### 4.7 Determinism and purity — renderers and reconciler
The entire value of this project rests on "same schema in, same code out." Renderers
and the (later) reconciler must be:
- **Pure** — no reads of mutable global state, no hidden randomness, no dependence on
  object-key iteration order or `Date.now()`-flavored inputs.
- **Tested for determinism directly** — a test that runs the same renderer twice on the
  same fixture and asserts byte-identical output belongs in CI, not just a normal unit
  test that checks correctness once.

### 4.8 Testing
- **Renderers**: golden-file/snapshot tests. Fixed schema fixtures checked into the
  repo, with their expected code output checked in next to them. A diff in output
  requires an explicit, reviewed update to the golden file — never a silent overwrite.
- **Normalization layer**: scored against the hand-labeled eval set (§7), not just
  "tests pass." Precision/recall per node-role category, tracked over time, visible in
  CI — a heuristic change that quietly regresses accuracy on one role while improving
  another should be visible before merge, not discovered later.
- **Adapters**: tested against recorded API fixtures (record/replay). CI never makes
  live calls to Figma or Penpot.

### 4.9 Documentation
- Every exported function and type gets a one-line doc comment stating *intent*, not a
  restatement of the signature.
- Every module folder gets a short `README.md`: what this module's one job is, what it
  may import, what it must never import.

---

## 5. Folder structure

```
/schema           canonical Design DOM types + Zod validators           (Step 1)
/adapters
  /figma          Figma REST API → schema                               (Step 2)
  /penpot         Penpot API → schema                                   (Step 3)
/normalization    role-inference: heuristics, ML escalation, eval hooks (Step 4)
/mcp-server       MCP tool definitions + transports                     (Step 5)
/renderers
  /html-css
  /jsx-tsx
  /svg                                                                  (Step 6)
/reconciler        deferred — tree-diff/patch engine
/ml                Python sidecar — deferred: tracer + generative pipeline
/eval              hand-labeled fixtures + scoring scripts
```

---

## 6. Definition of done, per step

- **Schema**: versioned, documented, validated by Zod, with a changelog for any
  breaking change.
- **Adapter**: given a real file, produces a schema tree with zero data loss on
  geometry, style, and hierarchy — verified against a recorded fixture, not a live call.
- **Normalization**: meets the agreed accuracy bar on the eval set, with heuristics and
  any ML/LLM escalation paths documented in that module's README.
- **MCP server**: every tool is callable and inspectable via MCP Inspector before any
  real client config is attempted.
- **Renderer**: passes golden-file tests and the determinism test (§4.7) before merge.

---

## 7. The eval set

A hand-labeled set of real (anonymized) Figma and Penpot files with correct node roles
marked, lives in `/eval`. It is the only source of truth for whether the normalization
layer is improving or regressing. No accuracy claim about the normalization layer is
meaningful without a number from this set attached to it.