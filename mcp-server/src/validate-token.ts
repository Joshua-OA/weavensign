import { err, ok, type Result } from "@weavensign/schema";

export type TokenValidationError =
  | { kind: "rejected"; status: number }
  | { kind: "network"; cause: string };

export interface ValidatedToken {
  account: string;
}

/**
 * Live-validates a Figma access token against `GET /v1/me`, which doubles as the
 * account check: success reports the account email so setup can show *whose*
 * credentials were saved. Personal access tokens authenticate via X-Figma-Token;
 * OAuth tokens via Bearer — pass authStyle accordingly. Any 4xx/5xx is treated as
 * rejection (Figma returns 401 for bad tokens).
 */
export async function validateFigmaToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
  authStyle: "pat" | "oauth" = "pat",
): Promise<Result<ValidatedToken, TokenValidationError>> {
  let response: Response;
  try {
    const headers =
      authStyle === "oauth"
        ? { Authorization: `Bearer ${token}` }
        : { "X-Figma-Token": token };
    response = await fetchImpl("https://api.figma.com/v1/me", {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    return err({ kind: "network", cause: String(cause) });
  }
  if (!response.ok) {
    return err({ kind: "rejected", status: response.status });
  }
  const body = (await response.json()) as { email?: unknown };
  const account = typeof body.email === "string" ? body.email : "unknown Figma account";
  return ok({ account });
}

/**
 * Live-validates a Penpot access token against the same get-file RPC command the server
 * itself uses — probed with a nil UUID so a valid token yields any non-auth outcome
 * (file-not-found in some shape) while an invalid one yields 401/403. Only auth
 * failures reject; anything else proves the Authorization header was accepted.
 */
export async function validatePenpotToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<ValidatedToken, TokenValidationError>> {
  let response: Response;
  try {
    response = await fetchImpl("https://design.penpot.app/api/rpc/command/get-file", {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    return err({ kind: "network", cause: String(cause) });
  }
  if (response.status === 401 || response.status === 403) {
    return err({ kind: "rejected", status: response.status });
  }
  return ok({ account: "Penpot Cloud account" });
}
