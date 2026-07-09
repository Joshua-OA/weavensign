# @weavensign/normalization

One job: resolve semantic role (this shape is a *button*, this group is a *card*) from a
canonical `DesignNode` tree. Heuristics first; ML/LLM escalation only for ambiguous cases,
added later once heuristics alone are proven insufficient on the eval set.

## May import

- `@weavensign/schema`.

## Must never import

- `/adapters/*`, `/mcp-server`, `/renderers`. Normalization consumes the canonical schema
  only — it has no business knowing where a `DesignNode` tree came from.

## Role taxonomy

Defined in `src/role-label.ts` (`ROLE_LABELS`): `button`, `card`, `icon`, `nav-item`,
`input-field`, `heading`, `body-text`, `image`, `avatar`, `badge`, `other`. This is a
starting set for a small-common-UI eval pass, not final — extend `ROLE_LABELS` as real
labeled data shows categories that don't fit, but treat any addition as a breaking change
to anyone already scoring against the eval set (§7 of context.md).

`RoleLabel` intentionally lives here, not in `@weavensign/schema` — the schema describes
structure only; role is an inferred, normalization-owned annotation, kept as a separate
`{ nodeId, role, confidence }` record rather than a mutated field on `DesignNode` so the
same tree can be scored against multiple heuristic versions without cloning it.

## Status

First heuristic pass implemented in `src/heuristics/`: `classify-vector.ts` (icon/image/
avatar/badge by size, aspect ratio, sibling clustering, and parent-context for
button-background rects), `classify-text.ts` (heading/body-text/button/nav-item by font
size, text length, and a small common-label-word dictionary), `classify-container.ts`
(button/badge/nav-item/input-field by child-composition shape, falling back to
repetition/proportions-based card detection), and `classify-node.ts` (top-level
dispatcher/tree-walker exporting `classifyTree`, the package's public entry point). Each
pure classifier has its own unit tests.

Scored against `/eval`'s labeled fixtures via `npx tsx eval/run-heuristic.ts` (per-role
precision/recall, rebuild the package first with `npm run build` in `/normalization` —
`run-heuristic.ts` imports the built `@weavensign/normalization` package, not source).

Three fixtures: `figma-ecommerce-landing.json` (Figma, button/card/nav-heavy),
`penpot-logo-artwork.json` (Penpot, pure-artwork/image-only, no interactive UI),
`penpot-dashboard-ui.json` (Penpot, real app dashboard UI — button/avatar/input-field/
nav-item coverage). The dashboard fixture was added (learning_v0.md #022) specifically to
prove whether a heuristic tuned only against the first two fixtures generalizes to a
different tool's structural authoring conventions — initially it didn't (button/avatar/
nav-item all scored ~0 on first contact, #022), which drove structural (not textual)
detection signals for all three (#023) plus a `bg`-named/hairline-shape fallback fix (#024),
a parent-context signal so a button's own background rect isn't miscounted as `image`
(#025 — `classifyVector` now takes the node's parent, matching the same "full-width
background next to one text child" shape `classify-container.ts`'s `looksLikeButton`
already uses on the container itself), and a first `input-field` signal (#026 — a
name-anchored search-box check plus a 3-child bg+2-text pill shape in a height band between
badge and card).

Current per-role numbers (all three fixtures, `npx tsx eval/run-heuristic.ts`): Figma —
button P1.00/R0.79, card P0.79/R0.79, icon P1.00/R0.67, nav-item P0.89/R0.67, heading
P1.00/R0.60, body-text R1.00, image R0.97, badge P1.00/R0.94, other P0.86/R0.61 (no
input-field/avatar present in this fixture). Penpot dashboard — avatar P1.00/R1.00,
nav-item P0.89/R1.00, input-field P1.00/R0.67, button P0.75/R0.50, card P0.72/R0.62,
badge P0.97/R0.77, icon P0.76/R0.60, body-text R0.97, image P0.39/R0.68, other P0.41/R0.38,
heading R0.21 (mostly draft-label noise on tiny UI micro-labels, see #024 — not chased).
Penpot logo-artwork — image P1.00/R0.99 (this fixture has almost no other roles present).

**Known remaining gaps**, in rough priority order: (1) `image` false-positives on the
dashboard fixture (large flat-color background rects that aren't button-shaped, and
non-`bg`-named decorative panels) still need a real parent-context or fill-data signal —
`classify-vector.ts` only threads through a node's direct parent today, not full ancestry
or fill color; (2) `input-field` recall (0.67) misses a single-child pass-through wrapper
group (Penpot's `message-6`, which just wraps the real `Group-3` input pill) — no signal
exists for "this group's only child is itself an input-field," a one-off shape not worth
generalizing from a single example yet; (3) `other` precision/recall on the dashboard
fixture (0.41/0.38) is still weak — largely the same background-rect confusion as (1).
**Those eval labels are still an unreviewed AI draft, not human-verified ground truth**
(see `/eval/README.md` Status) — treat every number above as a rough baseline to improve
from, not a proven accuracy claim, until the labels are reviewed and more varied fixtures
are added.
