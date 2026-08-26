import { readCredentials, writeCredentials } from "./credentials.js";
import { describeOAuthFailure, figmaBrowserAuth, type FigmaOAuthTokens } from "./oauth.js";
import { validateFigmaToken } from "./validate-token.js";

/**
 * Seamless first-run connection: triggered from INSIDE a tool call when no Figma
 * credentials exist. Opens the browser (the server runs on the user's machine), waits
 * for the loopback callback, persists the refreshable session, and lets the caller
 * retry its original request — so the user's first design fetch just works.
 *
 * Requires the user's Figma OAuth app credentials (env vars or previously stored);
 * without them there is nothing to authorize against and this returns false fast.
 */

export interface ConnectFigmaDeps {
  browserAuthImpl?: typeof figmaBrowserAuth;
}

let inFlight: Promise<boolean> | null = null;

async function persistTokens(tokens: FigmaOAuthTokens): Promise<void> {
  const stored = await readCredentials();
  const clientId = process.env.FIGMA_CLIENT_ID ?? stored.figmaClientId;
  const clientSecret = process.env.FIGMA_CLIENT_SECRET ?? stored.figmaClientSecret;
  const creds = await readCredentials();
  creds.figmaToken = tokens.accessToken;
  if (tokens.refreshToken !== undefined) {
    creds.figmaRefreshToken = tokens.refreshToken;
  }
  if (tokens.expiresAt !== undefined) {
    creds.figmaExpiresAt = tokens.expiresAt;
  }
  creds.figmaAuthKind = "oauth";
  // Persist the app credentials too: the runtime refresher needs them long after this
  // process is gone, and future server sessions may not inherit these env vars.
  if (clientId !== undefined) {
    creds.figmaClientId = clientId;
  }
  if (clientSecret !== undefined) {
    creds.figmaClientSecret = clientSecret;
  }
  await writeCredentials(creds);
}

async function connectOnce(deps: ConnectFigmaDeps): Promise<boolean> {
  if (process.env.WEAVENSIGN_NO_BROWSER === "1") {
    return false;
  }
  const stored = await readCredentials();
  const clientId = process.env.FIGMA_CLIENT_ID ?? stored.figmaClientId;
  const clientSecret = process.env.FIGMA_CLIENT_SECRET ?? stored.figmaClientSecret;
  if (!clientId || !clientSecret) {
    console.error(
      "No Figma connection yet. For automatic browser login, register a free OAuth app at\n" +
        "https://www.figma.com/developers/apps (redirect URL http://localhost:55887/callback) and set\n" +
        "FIGMA_CLIENT_ID / FIGMA_CLIENT_SECRET — or run `npx @weavensign/mcp-server setup` to paste a token.",
    );
    return false;
  }

  try {
    const browserAuth = deps.browserAuthImpl ?? figmaBrowserAuth;
    const tokens = await browserAuth({ clientId, clientSecret });
    await persistTokens(tokens);
    // Best-effort account display; the exchange already proved the token works.
    const verified = await validateFigmaToken(tokens.accessToken, fetch, "oauth").catch(() => null);
    console.error(
      verified?.ok
        ? `Connected to Figma (${verified.value.account}). Continuing your request...\n`
        : "Connected to Figma. Continuing your request...\n",
    );
    return true;
  } catch (error) {
    console.error(
      `Automatic Figma connection failed: ${describeOAuthFailure(error)}. ` +
        "Run `npx @weavensign/mcp-server setup` to paste a personal access token instead.\n",
    );
    return false;
  }
}

/**
 * Single-flight: concurrent tool calls hitting a missing token share one browser
 * session instead of opening N tabs.
 */
export async function ensureFigmaConnected(deps: ConnectFigmaDeps = {}): Promise<boolean> {
  if (!inFlight) {
    inFlight = connectOnce(deps).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Test hook: clears the single-flight guard between tests. */
export function resetConnectState(): void {
  inFlight = null;
}
