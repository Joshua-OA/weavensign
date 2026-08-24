import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface FigmaOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when the access token stops working (from Figma's expires_in). */
  expiresAt?: number;
  userId?: string;
}

export type FigmaOAuthError =
  | { kind: "timeout" }
  | { kind: "denied"; detail?: string }
  | { kind: "state-mismatch" }
  | { kind: "exchange-failed"; status: number; detail: string };

export interface BrowserAuthOptions {
  clientId: string;
  clientSecret: string;
  /** Fixed loopback port must match a redirect URL registered on the Figma OAuth app. */
  port?: number;
  scope?: string;
  /** ms to wait for the user to finish in the browser. Default 5 minutes. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Injectable so tests never touch a real browser. Defaults to platform `open`. */
  openImpl?: (url: string) => void;
}

const DEFAULT_PORT = 55887;
const AUTHORIZE_URL = "https://www.figma.com/oauth";
const TOKEN_URL = "https://api.figma.com/v1/oauth/token";

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Opens the OS browser at `url`. Best-effort by design: if spawning fails (headless
 * boxes, odd platforms) we've already printed the URL, so the user can still click it.
 */
function defaultOpen(url: string): void {
  // Escape hatch for CI/headless/demo runs — the URL is always printed regardless.
  if (process.env.WEAVENSIGN_NO_OPEN === "1") {
    console.error("(auto-open disabled via WEAVENSIGN_NO_OPEN=1)");
    return;
  }
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", url] : [url];
  execFile(command, args, () => {});
}

/** Minimal interstitial so the browser tab doesn't sit on a connection error. */
function respond(res: ServerResponse, title: string, body: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><title>weavensign</title><body style="font-family:sans-serif;padding:3rem"><h2>${title}</h2><p>${body}</p></body>`);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on("end", () => resolve(data));
  });
}

// readBody currently unused; retained for POST-style callback flows.
void readBody;

/**
 * Runs the full local Authorization Code flow against Figma:
 *
 * 1. loopback HTTP listener on 127.0.0.1:<port>
 * 2. open the authorize URL in the user's browser (PKCE S256 + state CSRF guard)
 * 3. capture ?code= on /callback, verify state, exchange within Figma's 30s window
 *
 * Paste remains the fallback path if any step of this fails (see setup.ts).
 */
export async function figmaBrowserAuth(options: BrowserAuthOptions): Promise<FigmaOAuthTokens> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const openImpl = options.openImpl ?? defaultOpen;
  const scope = options.scope ?? "file_content:read";
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;

  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", Buffer.from(verifier))),
  );

  const requestedPort = options.port ?? (Number(process.env.FIGMA_OAUTH_PORT) || DEFAULT_PORT);

  const result = await new Promise<FigmaOAuthTokens>((resolveAuth, rejectAuth) => {
    const server = createServer((req, res) => {
      void handleCallback(req, res);
    });

    // Set once the listener knows its actual port — callbacks can't arrive earlier.
    let redirectUri = "";

    async function exchangeCode(code: string, redirectUri: string): Promise<FigmaOAuthTokens> {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });
      const response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw { kind: "exchange-failed", status: response.status, detail: await response.text() };
      }
      const parsed = (await response.json()) as {
        access_token?: unknown;
        refresh_token?: unknown;
        expires_in?: unknown;
        user_id_string?: unknown;
      };
      if (typeof parsed.access_token !== "string") {
        throw { kind: "exchange-failed", status: response.status, detail: "missing access_token in response" };
      }
      const tokens: FigmaOAuthTokens = { accessToken: parsed.access_token };
      if (typeof parsed.refresh_token === "string") {
        tokens.refreshToken = parsed.refresh_token;
      }
      if (typeof parsed.expires_in === "number") {
        tokens.expiresAt = Date.now() + parsed.expires_in * 1000;
      }
      if (typeof parsed.user_id_string === "string") {
        tokens.userId = parsed.user_id_string;
      }
      return tokens;
    }

    async function handleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/callback") {
        respond(res, "weavensign", "Waiting for Figma…");
        return;
      }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");

      if (error) {
        respond(res, "Authorization declined", "You can close this tab and retry setup.");
        cleanup();
        rejectAuth({ kind: "denied", detail: error });
        return;
      }
      if (!code || returnedState !== state) {
        // Don't tear down on a stray request — but a wrong state is fatal (CSRF).
        if (returnedState !== state && returnedState !== null) {
          respond(res, "weavensign", "State mismatch — please restart setup.");
          cleanup();
          rejectAuth({ kind: "state-mismatch" });
          return;
        }
        respond(res, "weavensign", "Waiting for Figma…");
        return;
      }
      respond(res, "Connected ✓", "weavensign is authorized. You can close this tab.");
      cleanup();

      try {
        resolveAuth(await exchangeCode(code, redirectUri));
      } catch (error) {
        rejectAuth(error);
      }
    }

    function cleanup(): void {
      clearTimeout(timer);
      server.close();
    }

    const timer = setTimeout(() => {
      server.close();
      rejectAuth({ kind: "timeout" });
    }, timeoutMs);

    server.on("error", rejectAuth);
    server.listen(requestedPort, "127.0.0.1", () => {
      const actualPort = (server.address() as AddressInfo).port;
      // Figma only redirects to URIs registered verbatim on the OAuth app, so production
      // uses the fixed DEFAULT_PORT; port 0 exists purely so tests get an ephemeral one.
      const callbackPort = requestedPort === 0 ? actualPort : requestedPort;
      redirectUri = `http://localhost:${callbackPort}/callback`;
      const authorizeUrl =
        `${AUTHORIZE_URL}?client_id=${encodeURIComponent(options.clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}` +
        `&response_type=code` +
        `&code_challenge=${challenge}&code_challenge_method=S256`;

      console.error(`Opening Figma in your browser:\n\n  ${authorizeUrl}\n`);
      console.error("(If nothing opens, copy the URL above into your browser.)\n");

      openImpl(authorizeUrl);
    });
  });

  return result;
}

/** Human-readable reason for an OAuth failure, shared by setup and runtime auto-connect. */
export function describeOAuthFailure(error: unknown): string {
  if (typeof error === "object" && error !== null && "kind" in error) {
    const e = error as { kind: string; detail?: string; status?: number };
    switch (e.kind) {
      case "timeout":
        return "timed out waiting for you to finish in the browser";
      case "denied":
        return `authorization declined${e.detail ? ` (${e.detail})` : ""}`;
      case "state-mismatch":
        return "state mismatch (possible CSRF) — please retry";
      case "exchange-failed":
        return `token exchange failed (HTTP ${e.status})`;
      case "refresh-failed":
        return `token refresh failed (HTTP ${e.status})`;
      default:
        return String(e.kind);
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export interface RefreshOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}

/**
 * Trades the reusable refresh token for a fresh access token. Tries the current token
 * endpoint first (`grant_type=refresh_token`); if that 404s (endpoint removed vs. the
 * older documented flow), falls back to the legacy dedicated refresh endpoint. Returns
 * the same shape as the initial exchange.
 */
export async function refreshFigmaAccessToken(options: RefreshOptions): Promise<FigmaOAuthTokens> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const basicAuth = `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64")}`;

  const attempt = async (url: string): Promise<Response> =>
    fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: basicAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: options.refreshToken }).toString(),
      signal: AbortSignal.timeout(15_000),
    });

  let response = await attempt(TOKEN_URL);
  if (response.status === 404 || response.status === 405) {
    response = await attempt("https://api.figma.com/v1/oauth/refresh");
  }
  if (!response.ok) {
    throw { kind: "refresh-failed", status: response.status, detail: await response.text() };
  }
  const parsed = (await response.json()) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    user_id_string?: unknown;
  };
  if (typeof parsed.access_token !== "string") {
    throw { kind: "refresh-failed", status: response.status, detail: "missing access_token in response" };
  }
  const tokens: FigmaOAuthTokens = { accessToken: parsed.access_token };
  tokens.refreshToken = typeof parsed.refresh_token === "string" ? parsed.refresh_token : options.refreshToken;
  if (typeof parsed.expires_in === "number") {
    tokens.expiresAt = Date.now() + parsed.expires_in * 1000;
  }
  if (typeof parsed.user_id_string === "string") {
    tokens.userId = parsed.user_id_string;
  }
  return tokens;
}
