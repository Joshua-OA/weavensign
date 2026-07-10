import { err, ok, type Result } from "@weavensign/schema";

export type FetchPenpotPageError =
  | { kind: "missing-token" }
  | { kind: "http-error"; status: number; body: string }
  | { kind: "page-not-found"; pageId: string };

interface PenpotGetFileResponse {
  data: { pagesIndex: Record<string, { objects: unknown }>; components: unknown };
}

/**
 * Fetches one Penpot page's `objects` map plus the file's shared `components`, via
 * Penpot's `get-file` RPC command. `Accept: application/json` switches Penpot's response
 * from its default Transit-JSON wire format to plain JSON (see learning_v0.md #007).
 */
export async function fetchPenpotPage(
  fileId: string,
  pageId: string,
  token: string | undefined,
): Promise<Result<{ objects: unknown; components: unknown }, FetchPenpotPageError>> {
  if (!token) {
    return err({ kind: "missing-token" });
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
    return err({ kind: "http-error", status: response.status, body: await response.text() });
  }
  const body = (await response.json()) as PenpotGetFileResponse;
  const page = body.data.pagesIndex[pageId];
  if (!page) {
    return err({ kind: "page-not-found", pageId });
  }
  return ok({ objects: page.objects, components: body.data.components });
}
