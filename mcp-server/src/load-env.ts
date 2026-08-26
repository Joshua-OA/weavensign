import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

export interface EnvFileResult {
  /** Keys that were copied into process.env. */
  applied: string[];
  /** Keys present in the file but skipped because the environment already had them. */
  skipped: string[];
}

/** Strips one matching pair of surrounding single/double quotes, if present. */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first: string | undefined = value[0];
    const last: string | undefined = value.at(-1);
    if (first !== undefined && (first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Searches up the directory tree for .env file starting from the given directory.
 * Returns the first .env path found, or null if none found before reaching root.
 */
function findEnvFile(startDir: string): string | null {
  let current = startDir;
  while (true) {
    const envPath = join(current, ".env");
    if (existsSync(envPath)) {
      return envPath;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

/** Parses one `.env` line into a key/value pair, or null for comments/blank/malformed lines. */
function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) {
    return null;
  }
  const eq = trimmed.indexOf("=");
  if (eq <= 0) {
    return null;
  }
  const key = trimmed.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }
  return [key, stripQuotes(trimmed.slice(eq + 1).trim())];
}

/**
 * Applies KEY=VALUE pairs from a `.env` file to process.env without overriding
 * variables the environment already provides. Exists so credentials documented in
 * `.env.example` (FIGMA_CLIENT_ID/SECRET for browser login) actually reach the
 * server when running from a clone, without requiring shell exports or a dotenv
 * dependency. A missing or unreadable file is routine (npx installs, spawned MCP
 * clients with unrelated working directories) and yields an empty result rather
 * than an error. When no explicit path is given, searches up from cwd for .env.
 */
export function loadEnvFile(filePath?: string): EnvFileResult {
  let path: string | null;
  if (filePath !== undefined) {
    path = filePath;
  } else {
    path = findEnvFile(process.cwd());
    if (path === null) {
      return { applied: [], skipped: [] };
    }
  }
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return { applied: [], skipped: [] };
  }
  const result: EnvFileResult = { applied: [], skipped: [] };
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed === null) {
      continue;
    }
    const [key, value] = parsed;
    if (process.env[key] !== undefined) {
      result.skipped.push(key);
      continue;
    }
    process.env[key] = value;
    result.applied.push(key);
  }
  return result;
}
