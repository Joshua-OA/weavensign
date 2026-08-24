import "./cjs-shim.js";

/**
 * Thin dispatcher so ONE published bin serves both entry points (multiple bins would
 * break `npx @weavensign/mcp-server` auto-resolution, which requires either a single
 * bin or a bin matching the unscoped package name). No args = stdio MCP server; the
 * literal first arg "setup" runs the interactive token onboarding flow instead.
 */
async function main(): Promise<void> {
  if (process.argv[2] === "setup") {
    const { runSetup } = await import("./setup.js");
    await runSetup();
    return;
  }
  const { runServer } = await import("./main.js");
  await runServer();
}

main().catch((error: unknown) => {
  console.error("weavensign CLI failed:", error);
  process.exit(1);
});
