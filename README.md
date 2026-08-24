# weavensign

AI native infra for designs. Fetches Figma/Penpot designs via MCP tools, classifies
semantic roles (button, card, icon, ...), and renders to HTML/CSS, JSX/TSX, or SVG.

## Setup

Install and configure in two commands — no clone needed:

```bash
npx -y @weavensign/mcp-server setup
```

**Figma connects via browser OAuth — including automatically mid-session**: if a tool is
called with no stored credentials and `FIGMA_CLIENT_ID` / `FIGMA_CLIENT_SECRET` are
visible to the server, it opens figma.com in your browser, waits for approval, stores the
refreshable session, and transparently retries your original request. Requires a free
one-time OAuth app registration:

1. Create an app at [figma.com/developers/apps](https://www.figma.com/developers/apps)
2. Add redirect URL `http://localhost:55887/callback`
3. Export `FIGMA_CLIENT_ID` / `FIGMA_CLIENT_SECRET`, rerun setup

**Paste still works everywhere** — browser login failing or unconfigured falls back to
pasting a personal access token (validated live before saving), and Penpot is
paste-only today (its API has no third-party OAuth yet).

Tokens/credentials live in `~/.weavensign/credentials.json` (permissions 0600). You enter
each credential once, ever. Environment variables (`FIGMA_TOKEN` / `PENPOT_TOKEN`)
always take precedence over the store for CI/containers.

## Add to Claude Code

```bash
claude mcp add weavensign -- npx -y @weavensign/mcp-server
```

Verify it's connected:

```bash
claude mcp list
```

Any MCP-compatible client works the same way — point it at `npx -y @weavensign/mcp-server`
over stdio. Bun users: `bunx @weavensign/mcp-server`.

## Developing from a clone

```bash
npm install
npm run build
npm run test
```

Run the local build directly: `node mcp-server/dist/server.js` (stdio), or
`node mcp-server/dist/server.js setup` for onboarding. Releases publish automatically via
GitHub Actions when a tag matching the package version is pushed (`v0.1.0` → publishes
`@weavensign/mcp-server@0.1.0`).

## Tools

- `get_figma_design(fileKey, nodeId)` — fetch a Figma node tree.
- `get_penpot_page(fileId, pageId)` — fetch a Penpot page.
- `classify_roles(nodes)` — infer semantic roles (button, card, icon, ...) for a fetched
  node tree.
- `render_design(nodes, format)` — render a fetched node tree into real source:
  `html-css`, `jsx-tsx`, or `svg`.

See `mcp-server/README.md` for details, and each package's own README for how the
pipeline fits together.

## Dev process log

`dev_process/` holds `learning_v0.md` through `learning_v7.md` — a running, append-only
log of bugs hit and decisions made while building this project. Each entry is dated and
numbered (entry number is the stable citation key, e.g. "learning_v4.md #030"); code
comments and READMEs across the repo cite entries there to explain *why* something is
built the way it is. Never rewritten, only appended to — split into a new file once the
current one nears ~200 lines.
