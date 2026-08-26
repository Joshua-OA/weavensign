import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnvFile } from "./load-env.js";

describe("loadEnvFile", () => {
  const keys = ["WS_TEST_A", "WS_TEST_B", "WS_TEST_C"];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  function writeEnvFile(content: string): string {
    const file = join(mkdtempSync(join(tmpdir(), "ws-env-")), ".env");
    writeFileSync(file, content);
    return file;
  }

  it("applies KEY=VALUE pairs and strips surrounding quotes", () => {
    const file = writeEnvFile('WS_TEST_A=plain\nWS_TEST_B="double"\nWS_TEST_C=\'single\'\n');
    const result = loadEnvFile(file);
    expect(result.applied).toEqual(["WS_TEST_A", "WS_TEST_B", "WS_TEST_C"]);
    expect(process.env.WS_TEST_A).toBe("plain");
    expect(process.env.WS_TEST_B).toBe("double");
    expect(process.env.WS_TEST_C).toBe("single");
  });

  it("never overrides variables the environment already provides", () => {
    process.env.WS_TEST_A = "from-shell";
    const file = writeEnvFile("WS_TEST_A=from-file\nWS_TEST_B=applied\n");
    const result = loadEnvFile(file);
    expect(result.applied).toEqual(["WS_TEST_B"]);
    expect(result.skipped).toEqual(["WS_TEST_A"]);
    expect(process.env.WS_TEST_A).toBe("from-shell");
  });

  it("ignores comments, blank lines, and malformed entries", () => {
    const file = writeEnvFile("# comment\n\n=no-key\nBAD KEY=x\nWS_TEST_A=ok\r\n");
    const result = loadEnvFile(file);
    expect(result.applied).toEqual(["WS_TEST_A"]);
    expect(process.env.WS_TEST_A).toBe("ok");
  });

  it("returns an empty result when the file does not exist", () => {
    const missing = join(mkdtempSync(join(tmpdir(), "ws-env-")), "missing.env");
    expect(loadEnvFile(missing)).toEqual({ applied: [], skipped: [] });
  });

  it("searches up directory tree when no path given", () => {
    const root = mkdtempSync(join(tmpdir(), "ws-env-"));
    const subdir = join(root, "nested", "deeper");
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(root, ".env"), "WS_TEST_A=found-in-root\n");

    const savedCwd = process.cwd();
    try {
      process.chdir(subdir);
      const result = loadEnvFile();
      expect(result.applied).toEqual(["WS_TEST_A"]);
      expect(process.env.WS_TEST_A).toBe("found-in-root");
    } finally {
      process.chdir(savedCwd);
    }
  });

  it("returns empty result when no .env found up tree", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-env-no-env-"));
    const savedCwd = process.cwd();
    try {
      process.chdir(dir);
      const result = loadEnvFile();
      expect(result).toEqual({ applied: [], skipped: [] });
    } finally {
      process.chdir(savedCwd);
    }
  });
});
