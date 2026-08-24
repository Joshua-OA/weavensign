import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readCredentials, writeCredentials } from "./credentials.js";
import { authorizedFigmaFetch, getFigmaAuth } from "./figma-auth.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("figma-auth", () => {
  let previousConfigDir: string | undefined;
  let savedFigmaToken: string | undefined;

  beforeEach(() => {
    previousConfigDir = process.env.WEAVENSIGN_CONFIG_DIR;
    process.env.WEAVENSIGN_CONFIG_DIR = join(mkdtempSync(join(tmpdir(), "ws-auth-")), "config");
    savedFigmaToken = process.env.FIGMA_TOKEN;
    delete process.env.FIGMA_TOKEN;
  });

  afterEach(() => {
    if (previousConfigDir === undefined) delete process.env.WEAVENSIGN_CONFIG_DIR;
    else process.env.WEAVENSIGN_CONFIG_DIR = previousConfigDir;
    if (savedFigmaToken === undefined) delete process.env.FIGMA_TOKEN;
    else process.env.FIGMA_TOKEN = savedFigmaToken;
    vi.restoreAllMocks();
  });

  describe("getFigmaAuth", () => {
    it("returns no token when neither env nor store has one", async () => {
      expect(await getFigmaAuth()).toEqual({ kind: "pat" });
    });

    it("prefers the env var and marks it as a personal token", async () => {
      process.env.FIGMA_TOKEN = "env-pat";
      expect(await getFigmaAuth()).toEqual({ token: "env-pat", kind: "pat" });
    });

    it("returns stored OAuth tokens un-refreshed while they are still fresh", async () => {
      await writeCredentials({
        figmaToken: "fresh-oauth",
        figmaRefreshToken: "rt",
        figmaExpiresAt: Date.now() + 60_000_000,
        figmaAuthKind: "oauth",
        figmaClientId: "id",
        figmaClientSecret: "secret",
      });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(await getFigmaAuth()).toEqual({ token: "fresh-oauth", kind: "oauth" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("proactively refreshes an OAuth token inside the expiry window and persists the result", async () => {
      await writeCredentials({
        figmaToken: "stale-oauth",
        figmaRefreshToken: "rt-1",
        figmaExpiresAt: Date.now() + 10_000, // inside the 60s window
        figmaAuthKind: "oauth",
        figmaClientId: "id",
        figmaClientSecret: "secret",
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          jsonResponse(200, { access_token: "new-oauth", refresh_token: "rt-2", expires_in: 3600 }),
        ),
      );
      expect(await getFigmaAuth()).toEqual({ token: "new-oauth", kind: "oauth" });
      const updated = await readCredentials();
      expect(updated.figmaToken).toBe("new-oauth");
      expect(updated.figmaRefreshToken).toBe("rt-2");
    });
  });

  describe("authorizedFigmaFetch", () => {
    it("returns undefined when there is nothing to authenticate with", async () => {
      expect(await authorizedFigmaFetch("https://api.figma.com/v1/me")).toBeUndefined();
    });

    it("sends X-Figma-Token for personal tokens", async () => {
      await writeCredentials({ figmaToken: "pat-value", figmaAuthKind: "pat" });
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit): Promise<Response> => jsonResponse(200, {}));
      vi.stubGlobal("fetch", fetchMock);
      await authorizedFigmaFetch("https://api.figma.com/v1/me");
      const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
      expect(headers.get("X-Figma-Token")).toBe("pat-value");
      expect(headers.get("Authorization")).toBeNull();
    });

    it("sends Bearer for OAuth tokens and retries once via refresh on 401", async () => {
      await writeCredentials({
        figmaToken: "dead-token",
        figmaRefreshToken: "rt",
        figmaExpiresAt: Date.now() + 60_000_000,
        figmaAuthKind: "oauth",
        figmaClientId: "id",
        figmaClientSecret: "secret",
      });
      const TOKEN_URL = "https://api.figma.com/v1/oauth/token";
      const apiCalls: Headers[] = [];
      const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        if (String(url) === TOKEN_URL) {
          return jsonResponse(200, { access_token: "revived-token", expires_in: 3600 });
        }
        apiCalls.push(new Headers(init?.headers));
        return apiCalls.length === 1 ? jsonResponse(401, {}) : jsonResponse(200, { ok: true });
      }) as unknown as typeof fetch;
      vi.stubGlobal("fetch", fetchMock);

      const response = await authorizedFigmaFetch("https://api.figma.com/v1/me");
      expect(response?.ok).toBe(true);
      // first attempt (401, dead Bearer) + one retry after refresh
      expect(apiCalls.length).toBe(2);
      expect(apiCalls[0]?.get("Authorization")).toBe("Bearer dead-token");
      expect(apiCalls[1]?.get("Authorization")).toBe("Bearer revived-token");
    });
  });
});
