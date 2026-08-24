import { describe, expect, it, vi } from "vitest";
import { validateFigmaToken, validatePenpotToken } from "./validate-token.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("validateFigmaToken", () => {
  it("sends the token as X-Figma-Token and reports the account email on success", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, { email: "dev@example.com", handle: "dev" }),
    );
    const result = await validateFigmaToken("tok-123", fetchImpl);
    expect(result).toEqual({ ok: true, value: { account: "dev@example.com" } });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({ "X-Figma-Token": "tok-123" });
  });

  it("treats any non-ok status as rejection", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(401, {}));
    const result = await validateFigmaToken("bad", fetchImpl);
    expect(result).toEqual({ ok: false, error: { kind: "rejected", status: 401 } });
  });

  it("maps fetch failures to a network error instead of rejecting the token", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await validateFigmaToken("tok", fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network");
    }
  });
});

describe("validatePenpotToken", () => {
  it("probes get-file with a nil UUID and accepts non-auth responses as valid", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(404, { error: "not-found" }));
    const result = await validatePenpotToken("tok-456", fetchImpl);
    expect(result).toEqual({ ok: true, value: { account: "Penpot Cloud account" } });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://design.penpot.app/api/rpc/command/get-file");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: "Token tok-456" });
    expect(String(init?.body)).toContain("00000000-0000-0000-0000-000000000000");
  });

  it("rejects auth failures (401/403)", async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(status, {}));
      const result = await validatePenpotToken("bad", fetchImpl);
      expect(result).toEqual({ ok: false, error: { kind: "rejected", status } });
    }
  });

  it("maps fetch failures to a network error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
    const result = await validatePenpotToken("tok", fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network");
    }
  });
});
