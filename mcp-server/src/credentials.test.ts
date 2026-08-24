import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configDir, readCredentials, resolveToken, writeCredentials } from "./credentials.js";

/** Writes a raw credentials file without going through writeCredentials' mkdir. */
function writeRawCredentialsFile(content: string): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(join(configDir(), "credentials.json"), content);
}

describe("credentials", () => {
  let previousConfigDir: string | undefined;
  let scratch: string;

  beforeEach(() => {
    previousConfigDir = process.env.WEAVENSIGN_CONFIG_DIR;
    scratch = join(mkdtempSync(join(tmpdir(), "ws-creds-")), "config");
    process.env.WEAVENSIGN_CONFIG_DIR = scratch;
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.WEAVENSIGN_CONFIG_DIR;
    } else {
      process.env.WEAVENSIGN_CONFIG_DIR = previousConfigDir;
    }
  });

  it("configDir honors WEAVENSIGN_CONFIG_DIR", () => {
    expect(configDir()).toBe(scratch);
  });

  it("readCredentials returns {} when no file exists", async () => {
    expect(await readCredentials()).toEqual({});
  });

  it("readCredentials returns {} for corrupt JSON instead of throwing", async () => {
    writeRawCredentialsFile("{not json");
    expect(await readCredentials()).toEqual({});
  });

  it("readCredentials ignores non-object JSON and non-string fields", async () => {
    writeRawCredentialsFile("[1,2]");
    expect(await readCredentials()).toEqual({});

    writeRawCredentialsFile(JSON.stringify({ figmaToken: 42, penpotToken: "real" }));
    expect(await readCredentials()).toEqual({ penpotToken: "real" });
  });

  it("writeCredentials round-trips with restrictive permissions", async () => {
    await writeCredentials({ figmaToken: "f", penpotToken: "p" });
    const filePath = join(configDir(), "credentials.json");
    expect((statSync(configDir()).mode & 0o777) === 0o700).toBe(true);
    expect((statSync(filePath).mode & 0o777) === 0o600).toBe(true);
    expect(await readCredentials()).toEqual({ figmaToken: "f", penpotToken: "p" });
  });

  describe("resolveToken", () => {
    const envKeys = ["FIGMA_TOKEN", "PENPOT_TOKEN"] as const;
    let savedEnv: Record<string, string | undefined>;

    beforeEach(async () => {
      savedEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
      envKeys.forEach((k) => delete process.env[k]);
      await writeCredentials({ figmaToken: "stored-figma", penpotToken: "stored-penpot" });
    });

    afterEach(() => {
      envKeys.forEach((k) => {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
      });
    });

    it("prefers the environment variable over the stored token", async () => {
      process.env.FIGMA_TOKEN = "env-figma";
      expect(await resolveToken("figma")).toBe("env-figma");
      process.env.PENPOT_TOKEN = "env-penpot";
      expect(await resolveToken("penpot")).toBe("env-penpot");
    });

    it("falls back to the store when the env var is absent", async () => {
      expect(await resolveToken("figma")).toBe("stored-figma");
      expect(await resolveToken("penpot")).toBe("stored-penpot");
    });

    it("returns undefined when neither source has a token", async () => {
      await writeCredentials({});
      expect(await resolveToken("figma")).toBeUndefined();
    });
  });
});
