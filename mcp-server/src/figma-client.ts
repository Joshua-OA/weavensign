import { err, ok, type Result } from "@weavensign/schema";

export type FetchFigmaNodesError =
  | { kind: "missing-token" }
  | { kind: "http-error"; status: number; body: string };

/**
 * Fetches raw node JSON from Figma's REST API for one file/node pair. Requires
 * `geometry=paths` in the request — without it Figma omits `fillGeometry` (see
 * @weavensign/adapter-figma's parseFigmaNodes doc comment).
 */
export async function fetchFigmaNodes(
  fileKey: string,
  nodeId: string,
  token: string | undefined,
): Promise<Result<unknown, FetchFigmaNodesError>> {
  if (!token) {
    return err({ kind: "missing-token" });
  }
  const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}&geometry=paths`;
  const response = await fetch(url, { headers: { "X-Figma-Token": token } });
  if (!response.ok) {
    return err({ kind: "http-error", status: response.status, body: await response.text() });
  }
  const body: unknown = await response.json();
  return ok(body);
}
