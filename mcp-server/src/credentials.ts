import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Credentials {
  figmaToken?: string;
  penpotToken?: string;
  /** Present only when figmaToken came from the browser OAuth flow. */
  figmaRefreshToken?: string;
  /** Epoch ms after which the OAuth access token must be refreshed. */
  figmaExpiresAt?: number;
  /** Which flow produced figmaToken — decides Bearer vs X-Figma-Token header. */
  figmaAuthKind?: "oauth" | "pat";
  /** The user's own Figma OAuth app credentials, persisted so runtime refresh works. */
  figmaClientId?: string;
  figmaClientSecret?: string;
}

/** Logical service names used by resolveToken — not the credential field names. */
export type CredentialService = "figma" | "penpot";

/**
 * Directory holding weavensign's local state. Overridable via WEAVENSIGN_CONFIG_DIR
 * (used by tests and CI); defaults to ~/.weavensign.
 */
export function configDir(): string {
  return process.env.WEAVENSIGN_CONFIG_DIR ?? join(homedir(), ".weavensign");
}

function credentialsPath(): string {
  return join(configDir(), "credentials.json");
}

/**
 * Reads stored tokens. Deliberately tolerant: missing file, unreadable file, or corrupt
 * JSON all yield {} — the server must never crash over local state, and a missing token
 * surfaces later as an actionable missing-token tool error instead. Setup overwrites the
 * whole file after validation, which also repairs corruption as a side effect.
 */
export async function readCredentials(): Promise<Credentials> {
  try {
    const raw = await readFile(credentialsPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    const creds: Credentials = {};
    if (typeof record.figmaToken === "string") {
      creds.figmaToken = record.figmaToken;
    }
    if (typeof record.penpotToken === "string") {
      creds.penpotToken = record.penpotToken;
    }
    if (typeof record.figmaRefreshToken === "string") {
      creds.figmaRefreshToken = record.figmaRefreshToken;
    }
    if (typeof record.figmaExpiresAt === "number") {
      creds.figmaExpiresAt = record.figmaExpiresAt;
    }
    if (record.figmaAuthKind === "oauth" || record.figmaAuthKind === "pat") {
      creds.figmaAuthKind = record.figmaAuthKind;
    }
    if (typeof record.figmaClientId === "string") {
      creds.figmaClientId = record.figmaClientId;
    }
    if (typeof record.figmaClientSecret === "string") {
      creds.figmaClientSecret = record.figmaClientSecret;
    }
    return creds;
  } catch {
    return {};
  }
}

/**
 * Writes tokens atomically-enough for a single-user CLI: creates the directory with
 * owner-only permissions, writes the file owner-only (0600 — it holds live API tokens).
 * Throws on real filesystem errors: setup should fail loudly rather than silently
 * claim tokens were saved.
 */
export async function writeCredentials(creds: Credentials): Promise<void> {
  const dir = configDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(
    credentialsPath(),
    `${JSON.stringify(creds, null, 2)}\n`,
    { mode: 0o600 },
  );
}

/**
 * Resolves the token for one service: explicit environment variable wins (back-compat,
 * and lets CI/containers override without touching local state), then the persistent
 * store written by the setup command. Undefined means "no token anywhere" — callers
 * turn that into an actionable error naming the setup command.
 */
export async function resolveToken(service: CredentialService): Promise<string | undefined> {
  const envVar = service === "figma" ? "FIGMA_TOKEN" : "PENPOT_TOKEN";
  const fromEnv = process.env[envVar];
  if (fromEnv) {
    return fromEnv;
  }
  const creds = await readCredentials();
  return service === "figma" ? creds.figmaToken : creds.penpotToken;
}
