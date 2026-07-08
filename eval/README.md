# /eval

Hand-labeled, real (anonymized) Figma and Penpot files with correct node roles marked.
The only source of truth for whether `/normalization` is improving or regressing
(context.md §7). No accuracy claim about the normalization layer is meaningful without a
number from this set.

## Layout

```
/eval
  /fixtures        canonical DesignNode trees (JSON), one file per labeled design
  /labels          hand-labeled roles for each fixture, same basename, one row per node
  score.ts         compares a RoleAssignment[] (normalization output) against /labels
```

## Fixture format

`fixtures/<name>.json` — a single canonical `DesignNode` tree (schema/src/nodes.ts),
already adapter-mapped. Must come from a **real** design file (via the adapters' live
fetch scripts, `npm run fetch:figma` / `fetch:penpot`), anonymized (renamed
text/user-identifying strings), not hand-synthesized — synthetic fixtures test whether
code runs, not whether heuristics generalize to real, messy authoring.

## Label format

`labels/<name>.json` — array of `{ nodeId: string, role: RoleLabel }`, one entry per node
in the matching fixture that a human labeler assigned a role to. Nodes with no clear role
should be labeled `"other"` explicitly, not omitted — an omitted node and a correctly-
scored `"other"` node mean different things to precision/recall.

```json
[
  { "nodeId": "1:23", "role": "button" },
  { "nodeId": "1:24", "role": "icon" }
]
```

## Scoring

`score.ts` takes a fixture name, runs it through a supplied heuristic function, and
reports precision/recall **per role category** against the matching label file — not just
an aggregate pass rate, per context.md §4.8 ("a heuristic change that quietly regresses
accuracy on one role while improving another should be visible before merge").

## Status

Three fixtures fetched, anonymized, and labeled:
- `figma-ecommerce-landing.json` — real e-commerce landing page, 261 nodes
- `penpot-logo-artwork.json` — real SVG logo/artwork page, 161 nodes (image-only, exercises
  almost none of `ROLE_LABELS` besides `image`/`body-text`/`other`)
- `penpot-dashboard-ui.json` — real Penpot dashboard UI (search, stat pills, nav, calendar,
  message cards, task form, buttons, avatars), 389 nodes — the only fixture exercising
  `avatar` and `input-field`, and the fixture that exposed the normalization heuristic's
  Figma-only tuning (see learning_v0.md #022): button/avatar/nav-item recall near zero on
  first score against it, despite strong scores on the Figma fixture.

**Caveat: current labels are an unreviewed AI-drafted first pass, not human-verified
ground truth.** They were assigned by reading node name/type/text/geometry — the same
signals a heuristic would use — so a heuristic tuned against these labels risks matching
labeling logic rather than real design-authoring signal, and any precision/recall number
computed against them should not yet be treated as a real accuracy claim per context.md §7.
Before this eval set is relied on to gate a heuristic change:
1. A human should review and correct `labels/*.json` against the fixtures.
2. More fixtures (more files, varied authors/naming conventions, non-English content,
   different design-tool idioms) should be added — three files, two from the same
   underlying Penpot template, is still a thin sample of what a deployed normalization
   layer will see.
