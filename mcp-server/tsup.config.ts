import { defineConfig } from "tsup";

/**
 * Publish build: bundles every dependency (@weavensign/* workspace packages, the MCP SDK,
 * zod) into self-contained single-file bins, so consumers install one small package.
 * Node builtins stay external (platform: "node"). Kept unminified so production stack
 * traces stay readable.
 *
 * prettier and svgo are deliberately NOT bundled (see external): both load files at
 * runtime relative to their own package directories — prettier via css-tree's
 * createRequire("../data/patch.json"), svgo via its by-name plugin loader — which cannot
 * survive bundling. They ship as normal npm dependencies and run from node_modules as
 * designed.
 *
 * CJS-in-ESM dynamic requires are fixed by src/cjs-shim.ts (imported first by each entry),
 * NOT by a banner here: banner bodies run after hoisted imports evaluate, but the breaking
 * require() calls fire during chunk initialization.
 */
const BUNDLED_DEPS = [
  "@modelcontextprotocol/sdk",
  "@weavensign/adapter-figma",
  "@weavensign/adapter-penpot",
  "@weavensign/normalization",
  "@weavensign/renderer-html-css",
  "@weavensign/renderer-jsx-tsx",
  "@weavensign/renderer-svg",
  "@weavensign/schema",
  "zod",
];

export default defineConfig([
  {
    entry: { server: "src/server.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    bundle: true,
    noExternal: BUNDLED_DEPS,
    external: ["prettier", "svgo"],
    sourcemap: false,
    dts: false,
    clean: true,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
