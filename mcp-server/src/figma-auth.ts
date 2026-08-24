import { readCredentials, writeCredentials } from "./credentials.js";
import { refreshFigmaAccessToken } from "./oauth.js";

/** Where the active Figma token came from — decides which auth header Figma expects. */
export type FigmaAuthKind = "oauth" | "pat";

export interface FigmaAuth {
  token?: string;
  kind: FigmaAuthKind;
}

/**
 * Single-flight guard so concurrent tool calls hitting an expired token share one
 * refresh instead of racing N exchanges (each successful refresh invalidates the
 * previous access token — racing them could leave the loser holding a dead token).
 */
let inFlightRefresh: Promise<void> | null = null;

async function refreshStoredFigmaToken(): Promise<string | undefined> {
  const creds = await readCredentials();
  if (!creds.figmaRefreshToken || !creds.figmaClientId || !creds.figmaClientSecret) {
    return undefined;
  }
  if (!inFlightRefresh) {
    inFlightRefresh = (async () => {
      const tokens = await refreshFigmaAccessToken({
        clientId: creds.figmaClientId as string,
        clientSecret: creds.figmaClientSecret as string,
        refreshToken: creds.figmaRefreshToken as string,
      });
      await writeCredentials({
        ...creds,
        figmaToken: tokens.accessToken,
        ...(tokens.refreshToken !== undefined ? { figmaRefreshToken: tokens.refreshToken } : {}),
        ...(tokens.expiresAt !== undefined ? { figmaExpiresAt: tokens.expiresAt } : {}),
        figmaAuthKind: "oauth",
      });
    })()
      .catch((error: unknown) => {
        inFlightRefresh = null;
        throw error;
      })
      .finally(() => {
        if (inFlightRefresh !== null) {
          inFlightRefresh = null;
        }
      });
  }
  await inFlightRefresh;
  return (await readCredentials()).figmaToken;
}

/**
 * Resolves the access token to call Figma with: FIGMA_TOKEN env var wins outright
 * (treated as a personal token — nothing to refresh), then the store. Stored OAuth
 * tokens are proactively refreshed within a minute of expiry so long-running sessions
 * don't stall on a predictable 401.
 */
export async function getFigmaAuth(): Promise<FigmaAuth> {
  const fromEnv = process.env.FIGMA_TOKEN;
  if (fromEnv) {
    return { token: fromEnv, kind: "pat" };
  }
  let creds = await readCredentials();
  let token = creds.figmaToken;
  let kind: FigmaAuthKind = creds.figmaAuthKind ?? "pat";
  if (!token) {
    return { kind };
  }
  const expiring =
    kind === "oauth" &&
    creds.figmaExpiresAt !== undefined &&
    Date.now() >= creds.figmaExpiresAt - 60_000 &&
    creds.figmaRefreshToken !== undefined &&
    creds.figmaClientId !== undefined &&
    creds.figmaClientSecret !== undefined;
  if (expiring) {
    try {
      await refreshStoredFigmaToken();
      creds = await readCredentials();
      if (creds.figmaToken) {
        token = creds.figmaToken;
        kind = creds.figmaAuthKind ?? "oauth";
      }
    } catch {
      // Proactive refresh failed (offline, revoked app) — try the old token anyway;
      // authorizedFigmaFetch's reactive path gets one more shot on a real 401.
    }
  }
  return { token, kind };
}

/**
 * Fetches a Figma REST URL with the resolved auth header. Returns undefined when no
 * token exists anywhere (caller maps that to its missing-token error value). On a 401
 * with a refreshable stored OAuth session, refreshes exactly once and retries.
 */
export async function authorizedFigmaFetch(url: string, init: RequestInit = {}): Promise<Response | undefined> {
  const first = await getFigmaAuth();
  if (!first.token) {
    return undefined;
  }
  const headersFor = (kind: FigmaAuthKind, token: string): Headers => {
    const headers = new Headers(init.headers);
    if (kind === "oauth") {
      headers.set("Authorization", `Bearer ${token}`);
    } else {
      headers.set("X-Figma-Token", token);
    }
    return headers;
  };

  const response = await fetch(url, { ...init, headers: headersFor(first.kind, first.token) });
  if (response.status !== 401 || first.kind === "pat") {
    return response;
  }
  const refreshed = await refreshStoredFigmaToken().catch(() => undefined);
  if (!refreshed) {
    return response;
  }
  return fetch(url, { ...init, headers: headersFor("oauth", refreshed) });
}
