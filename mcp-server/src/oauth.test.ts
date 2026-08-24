import { afterEach, describe, expect, it, vi } from "vitest";
import { figmaBrowserAuth, refreshFigmaAccessToken } from "./oauth.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Drives the whole local flow: captures the authorize URL via openImpl (no real
 * browser), then hits the loopback callback exactly like Figma would. */
async function drive(
  options: Parameters<typeof figmaBrowserAuth>[0],
  respondToCallback: (authorizeUrl: URL) => Promise<Response>,
): Promise<{ result?: Awaited<ReturnType<typeof figmaBrowserAuth>>; error?: unknown }> {
  let capturedError: unknown;
  const pending = figmaBrowserAuth({
    ...options,
    port: 0,
    openImpl: (url) => {
      void respondToCallback(new URL(url)).catch((error) => {
        capturedError = error;
      });
    },
  });
  try {
    return { result: await pending };
  } catch (error) {
    if (capturedError !== undefined && error === capturedError) throw error;
    return { error };
  }
}

describe("figmaBrowserAuth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the full loopback exchange and returns the tokens", async () => {
    // Exchange goes through the injectable fetchImpl — the REAL global fetch must stay
    // intact so the test itself can hit the loopback callback like Figma would.
    const exchangeCalls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      exchangeCalls.push({ url: String(url), init });
      return jsonResponse(200, {
        access_token: "at-1",
        refresh_token: "rt-1",
        expires_in: 90 * 24 * 3600,
        user_id_string: "12345",
      });
    }) as unknown as typeof fetch;

    const { result } = await drive({ clientId: "cid", clientSecret: "csecret", fetchImpl }, async (authorizeUrl) => {
      // The authorize URL must carry PKCE + state for the CSRF guard.
      expect(authorizeUrl.origin + authorizeUrl.pathname).toBe("https://www.figma.com/oauth");
      expect(authorizeUrl.searchParams.get("client_id")).toBe("cid");
      expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
      expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
      const callback = new URL(authorizeUrl.searchParams.get("redirect_uri") as string);
      // 127.0.0.1 explicitly: the server binds IPv4 loopback only, and Node's fetch
      // resolves "localhost" to ::1 first.
      return fetch(`http://127.0.0.1:${callback.port}/callback?code=the-code&state=${authorizeUrl.searchParams.get("state")}`);
    });

    expect(result?.accessToken).toBe("at-1");
    expect(result?.refreshToken).toBe("rt-1");
    expect(result?.userId).toBe("12345");
    expect(typeof result?.expiresAt).toBe("number");

    expect(exchangeCalls.length).toBe(1);
    const body = new URLSearchParams(String(exchangeCalls[0]?.init?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBeTruthy();
    const headers = new Headers(exchangeCalls[0]?.init?.headers);
    expect(headers.get("Authorization")).toBe(`Basic ${Buffer.from("cid:csecret").toString("base64")}`);
  });

  it("surfaces a declined authorization from the callback", async () => {
    const { error } = await drive({ clientId: "cid", clientSecret: "cs" }, async (authorizeUrl) => {
      const callback = new URL(authorizeUrl.searchParams.get("redirect_uri") as string);
      return fetch(`http://127.0.0.1:${callback.port}/callback?error=access_denied&state=${authorizeUrl.searchParams.get("state")}`);
    });
    expect(error).toMatchObject({ kind: "denied", detail: "access_denied" });
  });

  it("rejects state mismatches instead of exchanging the code", async () => {
    const exchangeSpy = vi.fn(async (): Promise<Response> => jsonResponse(200, {}));
    const { error } = await drive(
      { clientId: "cid", clientSecret: "cs", fetchImpl: exchangeSpy as unknown as typeof fetch },
      async (authorizeUrl) => {
      const callback = new URL(authorizeUrl.searchParams.get("redirect_uri") as string);
      return fetch(`http://127.0.0.1:${callback.port}/callback?code=x&state=tampered`);
    });
    expect(error).toMatchObject({ kind: "state-mismatch" });
    expect(exchangeSpy).not.toHaveBeenCalled();
  });

  it("times out when the user never completes the browser step", async () => {
    const { error } = await drive({ clientId: "cid", clientSecret: "cs", timeoutMs: 50 }, async () => {
      // no-op: nobody visits the callback
      return new Response();
    });
    expect(error).toMatchObject({ kind: "timeout" });
  }, 5000);
});

describe("refreshFigmaAccessToken", () => {
  it("exchanges the refresh token at the current token endpoint with Basic auth", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit): Promise<Response> => {
        calls.push({ url: String(url), init });
        return jsonResponse(200, { access_token: "new-at", refresh_token: "rt-new", expires_in: 3600 });
      }),
    );
    const tokens = await refreshFigmaAccessToken({
      clientId: "cid",
      clientSecret: "cs",
      refreshToken: "rt-old",
    });
    expect(tokens.accessToken).toBe("new-at");
    expect(tokens.refreshToken).toBe("rt-new");
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toBe("https://api.figma.com/v1/oauth/token");
    const body = new URLSearchParams(String(calls[0]?.init?.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-old");
  });

  it("falls back to the legacy refresh endpoint when the current one is gone", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL): Promise<Response> => {
        urls.push(String(url));
        if (String(url) === "https://api.figma.com/v1/oauth/refresh") {
          return jsonResponse(200, { access_token: "legacy-at" });
        }
        return jsonResponse(404, {});
      }),
    );
    const tokens = await refreshFigmaAccessToken({ clientId: "c", clientSecret: "s", refreshToken: "r" });
    expect(tokens.accessToken).toBe("legacy-at");
    expect(urls).toEqual(["https://api.figma.com/v1/oauth/token", "https://api.figma.com/v1/oauth/refresh"]);
  });
});
