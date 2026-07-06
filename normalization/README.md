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

Scaffolding only — no heuristics implemented yet. Next: label a first real (anonymized)
Figma/Penpot file in `/eval` against this taxonomy, then write heuristics against that
labeled set, scored via `/eval`'s scoring script. No accuracy claim about this module is
meaningful without a number from `/eval` attached (context.md §7).
