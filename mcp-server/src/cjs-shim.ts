import { createRequire } from "node:module";

/**
 * Must be the first import in every executable entry (server.ts, setup.ts): esbuild's
 * ESM output turns CJS dependencies' (prettier/postcss) internal `require(builtin)` calls
 * into a shim that throws "Dynamic require of ..." unless a real `require` exists, and
 * those calls fire during module initialization — i.e. before any entry-file statement
 * (including a banner body) could run. A hoisted import IS guaranteed to evaluate before
 * sibling chunks, so installing `require` on globalThis here covers them.
 */
(globalThis as Record<string, unknown>).require ??= createRequire(import.meta.url);
