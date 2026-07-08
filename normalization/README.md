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

First heuristic pass implemented in `src/heuristics/`: `classify-vector.ts` (icon vs image
by size/aspect ratio), `classify-text.ts` (heading/body-text/button/nav-item by font size,
text length, and a small common-label-word dictionary), `classify-container.ts`
(card vs other by sibling-name repetition and card-like proportions), and
`classify-node.ts` (top-level dispatcher/tree-walker exporting `classifyTree`, the
package's public entry point). Each pure classifier has its own unit tests.

Scored against `/eval`'s labeled fixtures via `npx tsx eval/run-heuristic.ts` (per-role
precision/recall). On the Figma fixture, after two iterations (see learning_v0.md #019,
#020): button P1.00/R0.79, heading P1.00/R0.60, badge P1.00/R0.94, body-text R1.00, icon
P1.00/R0.67, image R0.97. A third fixture (`penpot-dashboard-ui.json`, real Penpot app UI)
was added in learning_v0.md #022 specifically to test whether these results generalize
past Figma's authoring idioms — they don't yet: button R0.00, avatar R0.00, nav-item
P0.00/R0.00 on that fixture, because the heuristic's button/nav detection is text-word-based
(tuned to Figma's labels) and has no avatar signal at all. This is the current known gap —
`classify-container.ts` needs a real button-detection path and an avatar signal, and
nav-item detection needs to consider icon-group nav items, not just text labels, before
re-scoring all three fixtures together. **Those eval labels are still an unreviewed AI
draft, not human-verified ground truth** (see `/eval/README.md` Status) — treat every
number above as a rough baseline to improve from, not a proven accuracy claim, until the
labels are reviewed and more varied fixtures are added.
