import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readCredentials } from "./credentials.js";
import { ensureFigmaConnected, resetConnectState } from "./connect-figma.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("ensureFigmaConnected", () => {
  let previousConfigDir: string | undefined;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    previousConfigDir = process.env.WEAVENSIGN_CONFIG_DIR;
    process.env.WEAVENSIGN_CONFIG_DIR = join(mkdtempSync(join(tmpdir(), "ws-connect-")), "config");
    savedEnv = {};
    for (const key of ["FIGMA_TOKEN", "FIGMA_CLIENT_ID", "FIGMA_CLIENT_SECRET", "WEAVENSIGN_NO_BROWSER"]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    resetConnectState();
  });

  afterEach(() => {
    if (previousConfigDir === undefined) delete process.env.WEAVENSIGN_CONFIG_DIR;
    else process.env.WEAVENSIGN_CONFIG_DIR = previousConfigDir;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetConnectState();
    vi.restoreAllMocks();
  });

  it("fails fast with guidance when no OAuth app credentials exist anywhere", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const browserAuth = vi.fn();
    expect(await ensureFigmaConnected({ browserAuthImpl: browserAuth as never })).toBe(false);
    expect(browserAuth).not.toHaveBeenCalled();
    expect(logged.join("\n")).toContain("developers/apps");
  });

  it("respects WEAVENSIGN_NO_BROWSER=1 without opening anything", async () => {
    process.env.WEAVENSIGN_NO_BROWSER = "1";
    const browserAuth = vi.fn();
    expect(await ensureFigmaConnected({ browserAuthImpl: browserAuth as never })).toBe(false);
    expect(browserAuth).not.toHaveBeenCalled();
  });

  it("persists the exchanged OAuth session and reports success", async () => {
    process.env.FIGMA_CLIENT_ID = "cid";
    process.env.FIGMA_CLIENT_SECRET = "csecret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => jsonResponse(200, { email: "dev@example.com" })),
    );
    const tokens = { accessToken: "at-1", refreshToken: "rt-1", expiresAt: Date.now() + 1000 };
    const browserAuth = vi.fn(async (): Promise<typeof tokens> => tokens);
    expect(await ensureFigmaConnected({ browserAuthImpl: browserAuth as never })).toBe(true);
    const stored = await readCredentials();
    expect(stored.figmaToken).toBe("at-1");
    expect(stored.figmaRefreshToken).toBe("rt-1");
    expect(stored.figmaAuthKind).toBe("oauth");
    // App credentials persist too so the runtime refresher works in future sessions
    // that don't inherit these env vars.
    expect(stored.figmaClientId).toBe("cid");
    expect(stored.figmaClientSecret).toBe("csecret");
  });

  it("reports failure through stderr and returns false when the user declines", async () => {
    process.env.FIGMA_CLIENT_ID = "cid";
    process.env.FIGMA_CLIENT_SECRET = "csecret";
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const browserAuth = vi.fn(async (): Promise<never> => {
      throw { kind: "denied", detail: "access_denied" };
    });
    expect(await ensureFigmaConnected({ browserAuthImpl: browserAuth as never })).toBe(false);
    expect(logged.join("\n")).toContain("authorization declined");
    expect(logged.join("\n")).toContain("paste a personal access token instead");
  });

  it("shares one browser session across concurrent callers", async () => {
    process.env.FIGMA_CLIENT_ID = "cid";
    process.env.FIGMA_CLIENT_SECRET = "csecret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => jsonResponse(200, { email: "dev@example.com" })),
    );
    const browserAuth = vi.fn(async (): Promise<{ accessToken: string }> => ({ accessToken: "at" }));
    const [a, b] = await Promise.all([
      ensureFigmaConnected({ browserAuthImpl: browserAuth as never }),
      ensureFigmaConnected({ browserAuthImpl: browserAuth as never }),
    ]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(browserAuth).toHaveBeenCalledOnce();
  });
});
