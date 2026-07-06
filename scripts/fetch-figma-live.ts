/**
 * Manual verification tool: fetches a real Figma file/node via the REST API and runs it
 * through @weavensign/adapter-figma, printing the resulting DesignNode tree as JSON.
 * Not part of build/test — run directly with `npx tsx scripts/fetch-figma-live.ts`.
 *
 * Usage:
 *   FIGMA_TOKEN=... npx tsx scripts/fetch-figma-live.ts <fileKey> <nodeId>
 * or rely on FIGMA_TOKEN already exported from .env.
 */
import { parseFigmaNodes } from "@weavensign/adapter-figma";

async function main(): Promise<void> {
  const [fileKey, nodeId] = process.argv.slice(2);
  if (!fileKey || !nodeId) {
    console.error("Usage: npx tsx scripts/fetch-figma-live.ts <fileKey> <nodeId>");
    process.exit(1);
  }

  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error("FIGMA_TOKEN not set. Export it or run with `source .env && ...`.");
    process.exit(1);
  }

  const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}&geometry=paths`;
  const response = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (!response.ok) {
    console.error(`Figma API returned ${response.status}: ${await response.text()}`);
    process.exit(1);
  }
  const body: unknown = await response.json();

  const result = parseFigmaNodes(body, fileKey, [nodeId]);
  if (!result.ok) {
    console.error("Adapter error:", JSON.stringify(result.error, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result.value, null, 2));
}

main();
