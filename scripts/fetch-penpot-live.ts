/**
 * Manual verification tool: fetches a real Penpot file/page via the API and runs it
 * through @weavensign/adapter-penpot, printing the resulting DesignNode tree as JSON.
 * Not part of build/test — run directly with `npx tsx scripts/fetch-penpot-live.ts`.
 *
 * Usage:
 *   PENPOT_TOKEN=... npx tsx scripts/fetch-penpot-live.ts <fileId> <pageId>
 * or rely on PENPOT_TOKEN already exported from .env.
 */
import { parsePenpotPage } from "@weavensign/adapter-penpot";

async function main(): Promise<void> {
  const [fileId, pageId] = process.argv.slice(2);
  if (!fileId || !pageId) {
    console.error("Usage: npx tsx scripts/fetch-penpot-live.ts <fileId> <pageId>");
    process.exit(1);
  }

  const token = process.env.PENPOT_TOKEN;
  if (!token) {
    console.error("PENPOT_TOKEN not set. Export it or run with `source .env && ...`.");
    process.exit(1);
  }

  const response = await fetch("https://design.penpot.app/api/rpc/command/get-file", {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ id: fileId }),
  });
  if (!response.ok) {
    console.error(`Penpot API returned ${response.status}: ${await response.text()}`);
    process.exit(1);
  }
  const body = (await response.json()) as {
    data: { pagesIndex: Record<string, { objects: unknown }>; components: unknown };
  };

  const page = body.data.pagesIndex[pageId];
  if (!page) {
    console.error(`Page ${pageId} not found in file ${fileId}`);
    process.exit(1);
  }

  const result = parsePenpotPage(page.objects, body.data.components, fileId);
  if (!result.ok) {
    console.error("Adapter error:", JSON.stringify(result.error, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result.value, null, 2));
}

main();
