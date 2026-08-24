import { nextTick } from "node:process";
import * as readline from "node:readline";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureService, readHidden, type HiddenInputStreams, type ServicePlan } from "./setup.js";
import type { TokenValidationError } from "./validate-token.js";

type ValidationResult = { ok: true; value: { account: string } } | { ok: false; error: TokenValidationError };

function makeRl(): { rl: readline.Interface; input: PassThrough; cleanup: () => void } {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const rl = readline.createInterface({ input, output });
  return {
    rl,
    input,
    cleanup: () => {
      input.end();
      output.end();
      rl.close();
    },
  };
}

async function type(input: PassThrough, line: string): Promise<void> {
  await new Promise((resolve) => input.write(`${line}\n`, resolve));
  await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise((resolve) => nextTick(resolve));
}

function planWith(validate: (token: string) => Promise<ValidationResult>, extra?: Partial<ServicePlan>): ServicePlan {
  return {
    service: "figma",
    label: "TestService",
    envVar: "TEST_TOKEN",
    askPrompt: "Configure?",
    tokenPrompt: "Token: ",
    invalidHint: "see docs",
    validate,
    ...extra,
  };
}

/** Scripted hidden-reader: answers each prompt in order without touching a real TTY. */
function scriptedReader(answers: string[]): { readHiddenImpl: typeof readHidden; prompts: string[] } {
  const prompts: string[] = [];
  const readHiddenImpl = async (prompt: string): Promise<string> => {
    prompts.push(prompt);
    return answers.shift() ?? "";
  };
  return { readHiddenImpl: readHiddenImpl as unknown as typeof readHidden, prompts };
}

describe("configureService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns none without prompting when the user declines", async () => {
    const io = makeRl();
    const validate = vi.fn();
    try {
      const done = configureService(io.rl, planWith(validate), scriptedReader([]));
      await type(io.input, "n");
      expect(await done).toEqual({ kind: "none" });
      expect(validate).not.toHaveBeenCalled();
    } finally {
      io.cleanup();
    }
  });

  it("returns a validated pasted token and never echoes it", async () => {
    const io = makeRl();
    const secret = "super-secret-token-value";
    const validate = vi.fn().mockResolvedValue({ ok: true, value: { account: "me@example.com" } });
    const { readHiddenImpl } = scriptedReader([secret]);
    try {
      const done = configureService(io.rl, planWith(validate), { readHiddenImpl });
      await type(io.input, "y");
      expect(await done).toEqual({ kind: "token", token: secret });
      expect(validate).toHaveBeenCalledWith(secret);
    } finally {
      io.cleanup();
    }
  });

  it("re-prompts on rejection and gives up after three bad attempts", async () => {
    const io = makeRl();
    let calls = 0;
    const validate = vi.fn(async (): Promise<ValidationResult> => {
      calls += 1;
      return { ok: false, error: { kind: "rejected", status: 401 } };
    });
    const logged: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const { readHiddenImpl } = scriptedReader(["bad1", "bad2", "bad3"]);
    try {
      const done = configureService(io.rl, planWith(validate), { readHiddenImpl });
      await type(io.input, "y");
      expect(await done).toEqual({ kind: "none" });
      expect(calls).toBe(3);
      expect(logged.join("\n")).toContain("rejected that token");
    } finally {
      io.cleanup();
    }
  });

  it("skips without validating on empty input", async () => {
    const io = makeRl();
    const validate = vi.fn();
    const { readHiddenImpl } = scriptedReader([""]);
    try {
      const done = configureService(io.rl, planWith(validate), { readHiddenImpl });
      await type(io.input, "y");
      expect(await done).toEqual({ kind: "none" });
      expect(validate).not.toHaveBeenCalled();
    } finally {
      io.cleanup();
    }
  });

  it("prefers browser login by default and returns the exchanged tokens", async () => {
    const io = makeRl();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ email: "dev@example.com" }), { status: 200 })),
    );
    const logged: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const tokens = { accessToken: "at-123", refreshToken: "rt-456", expiresAt: Date.now() + 1000 };
    const browserAuth = vi.fn().mockResolvedValue(tokens);
    const validate = vi.fn();
    const { readHiddenImpl } = scriptedReader([]);
    try {
      const done = configureService(io.rl, planWith(validate, { browserAuth }), { readHiddenImpl });
      await type(io.input, "y"); // configure?
      await type(io.input, ""); // choose default [1] browser
      expect(await done).toEqual({ kind: "oauth", tokens });
      expect(browserAuth).toHaveBeenCalledOnce();
      expect(validate).not.toHaveBeenCalled(); // paste path untouched
      expect(logged.join("\n")).toContain("connected (dev@example.com)");
    } finally {
      io.cleanup();
    }
  });

  it("falls back to paste when browser login fails", async () => {
    const io = makeRl();
    const validate = vi.fn().mockResolvedValue({ ok: true, value: { account: "me@x.com" } });
    const logged: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const browserAuth = vi.fn().mockRejectedValue({ kind: "timeout" });
    const { readHiddenImpl } = scriptedReader(["pasted-token"]);
    try {
      const done = configureService(io.rl, planWith(validate, { browserAuth }), { readHiddenImpl });
      await type(io.input, "y");
      await type(io.input, ""); // chose browser...
      // ...browser timed out -> automatic fallback consumed the scripted paste
      expect(await done).toEqual({ kind: "token", token: "pasted-token" });
      expect(logged.join("\n")).toContain("timed out waiting");
      expect(logged.join("\n")).toContain("Falling back to pasting");
    } finally {
      io.cleanup();
    }
  });

  it("skips the browser entirely when the user picks paste", async () => {
    const io = makeRl();
    const browserAuth = vi.fn();
    const validate = vi.fn().mockResolvedValue({ ok: true, value: { account: "me@x.com" } });
    const { readHiddenImpl } = scriptedReader(["manual-token"]);
    try {
      const done = configureService(io.rl, planWith(validate, { browserAuth }), { readHiddenImpl });
      await type(io.input, "y");
      await type(io.input, "2");
      expect(await done).toEqual({ kind: "token", token: "manual-token" });
      expect(browserAuth).not.toHaveBeenCalled();
    } finally {
      io.cleanup();
    }
  });
});

/** Builds PassThrough-backed streams satisfying readHidden's structural contract. */
function hiddenStreams(): {
  streams: HiddenInputStreams;
  input: PassThrough;
  outputText: () => string;
} {
  const input = new PassThrough() as unknown as HiddenInputStreams["stdin"];
  let raw = false;
  (input as unknown as Record<string, unknown>).isTTY = true;
  input.isRaw = false;
  input.setRawMode = (mode: boolean) => {
    raw = mode;
  };
  Object.defineProperty(input, "isRaw", { get: () => raw, set: (m: boolean) => (raw = m) });
  const output = new PassThrough();
  let text = "";
  output.on("data", (chunk: Buffer) => {
    text += chunk.toString();
  });
  void (input as unknown as PassThrough).read;
  return {
    streams: { stdin: input, stdout: { write: (t: string) => output.write(t) } },
    input: input as unknown as PassThrough,
    outputText: () => text,
  };
}

describe("readHidden", () => {
  it("resolves on enter, masks every typed character, and supports backspace", async () => {
    const hs = hiddenStreams();
    const done = readHidden("Token: ", hs.streams);
    hs.input.write("abc");
    await new Promise((r) => setTimeout(r, 10));
    hs.input.write("\u007f"); // backspace removes 'c'
    hs.input.write("d\r");
    expect(await done).toBe("abd");
    const shown = hs.outputText();
    expect(shown).not.toContain("abd"); // raw secret never echoed
    expect(shown).toContain("\b \b"); // backspace visibly erased a masked char
    expect(shown.replace(/\b \b/g, "")).toContain("***");
  });

  it("rejects cleanly on ctrl-c instead of killing the flow", async () => {
    const hs = hiddenStreams();
    const done = readHidden("Token: ", hs.streams);
    hs.input.write("partial");
    await new Promise((r) => setTimeout(r, 10));
    hs.input.write("\u0003");
    await expect(done).rejects.toThrow("cancelled");
  });

  it("drops other control bytes (e.g. ctrl-d) instead of ending the stream", async () => {
    const hs = hiddenStreams();
    const done = readHidden("Token: ", hs.streams);
    hs.input.write("to\u0004ken\r");
    expect(await done).toBe("token");
  });

  it("rejects when stdin is not a TTY", async () => {
    const input = new PassThrough();
    await expect(
      readHidden("Token: ", {
        stdin: { ...(input as unknown as HiddenInputStreams["stdin"]), isTTY: false },
        stdout: { write: () => {} },
      }),
    ).rejects.toThrow("hidden input requires a TTY");
  });
});
