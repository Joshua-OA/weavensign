# @weavensign/mcp-server

One job: expose the Figma/Penpot adapters, the normalization layer, and the renderers to
MCP clients as callable tools, over stdio for local dev. No inference, mapping, or
rendering logic of its own — it wires HTTP fetch + adapter + normalization + renderer
together per tool call.

## May import

- `@weavensign/schema`, `@weavensign/adapter-figma`, `@weavensign/adapter-penpot`,
  `@weavensign/normalization`, `@weavensign/renderer-html-css`,
  `@weavensign/renderer-jsx-tsx`, `@weavensign/renderer-svg`.
- `@modelcontextprotocol/sdk`, `zod`.

## Tools

- **`get_figma_design(fileKey, nodeId)`** — fetches one Figma node (and its descendants)
  via the REST API and maps it into a `DesignNode[]`. Requires `FIGMA_TOKEN` in the
  server's environment. If the parsed tree has any image fill, makes a second call to
  Figma's `GET /v1/files/:key/images` and resolves each `assetRef` to a real URL (see
  `@weavensign/adapter-figma`'s `resolveImageFills`) — treated as an enhancement, not a
  requirement: a failure on this second call still returns the successfully-parsed nodes
  with unresolved (placeholder-rendering) image fills, rather than failing the whole
  tool call over a secondary request.
- **`get_penpot_page(fileId, pageId)`** — fetches one Penpot page via the `get-file` RPC
  command and maps its shape graph into a `DesignNode[]`. Requires `PENPOT_TOKEN`.
- **`classify_roles(nodes)`** — runs the normalization heuristics against a `DesignNode[]`
  (as returned by either fetch tool) and returns a `{ nodeId, role, confidence }` per node.
  Deliberately a separate tool, not bundled into the fetch tools — keeps the "no
  inference" adapter boundary and the heuristic normalization boundary visible at the
  tool-call level, not just in the module graph.
- **`render_design(nodes, format)`** — renders a `DesignNode[]` into real source:
  `"html-css"` (HTML + inline CSS), `"jsx-tsx"` (a single React function component), or
  `"svg"` (a single SVG document). Returns the rendered source as plain text (not
  JSON-wrapped — see `tool-result.ts`'s `textToolResult`), so a client writes it straight
  to a file. Takes the same `DesignNode[]` shape the fetch tools return — role labels from
  `classify_roles` aren't required as input (no renderer reads role today) but nothing
  stops passing the same tree through both.

Routine failures (missing token, HTTP error, adapter rejecting an unrecognized node
shape) are returned as `{ isError: true }` tool results with a human-readable message,
never thrown — see context.md §4.6. Tested end-to-end via
`@modelcontextprotocol/sdk`'s `InMemoryTransport` + `Client` (`create-server.test.ts`),
not just unit-level function calls, so a client actually connecting and calling
`listTools`/`callTool` is what's verified.

## Running

`FIGMA_TOKEN=... PENPOT_TOKEN=... npm run build && npm start` (stdio transport — point an
MCP client, e.g. MCP Inspector, at the resulting process). Per context.md §2, step 5's
done-when ("every tool listed and callable via MCP Inspector before any real client
config is attempted") has been verified live — see learning_v4.md #029.

## Known gaps

- No resources or prompts registered, only tools — nothing in context.md currently calls
  for either.
- `classify_roles`' accuracy is whatever `/normalization`'s current heuristics score
  against the eval set (see that package's README) — normalization was deliberately not
  blocked on a full accuracy bar or human-reviewed labels before this server was built
  (see learning_v3.md #027); this tool inherits that same known limitation.
