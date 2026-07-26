# weavensign

AI native infra for designs. Fetches Figma/Penpot designs via MCP tools, classifies
semantic roles (button, card, icon, ...), and renders to HTML/CSS, JSX/TSX, or SVG.

## Setup

```bash
npm install
npm run build
```

## Get API tokens

- **Figma**: generate a personal access token at
  [figma.com/developers/api#access-tokens](https://www.figma.com/developers/api#access-tokens)
  (Figma account → Settings → Personal access tokens).
- **Penpot**: generate an access token in your
  [Penpot account settings](https://design.penpot.app/#/settings/access-tokens)
  (only Penpot Cloud is supported today, not self-hosted instances).

## Add to Claude Code

```bash
claude mcp add weavensign \
  -e FIGMA_TOKEN=your_figma_token \
  -e PENPOT_TOKEN=your_penpot_token \
  -- node /absolute/path/to/weavensign/mcp-server/dist/server.js
```

Verify it's connected:

```bash
claude mcp list
```

Any MCP-compatible client works the same way — point it at
`mcp-server/dist/server.js` over stdio with `FIGMA_TOKEN`/`PENPOT_TOKEN` in its
environment.

## Tools

- `get_figma_design(fileKey, nodeId)` — fetch a Figma node tree.
- `get_penpot_page(fileId, pageId)` — fetch a Penpot page.
- `classify_roles(nodes)` — infer semantic roles (button, card, icon, ...) for a fetched
  node tree.
- `render_design(nodes, format)` — render a fetched node tree into real source:
  `html-css`, `jsx-tsx`, or `svg`.

See `mcp-server/README.md` for details, and each package's own README for how the
pipeline fits together.
