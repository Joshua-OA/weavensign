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

Scaffolding only. No fixtures labeled yet — first task is fetching one real Figma file and
one real Penpot file (via the existing live-fetch scripts), running them through the
adapters to get canonical trees, anonymizing, and hand-labeling against
`normalization/src/role-label.ts`'s `ROLE_LABELS`.
