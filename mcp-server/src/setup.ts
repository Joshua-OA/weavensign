import * as readline from "node:readline";
import {
  configDir,
  readCredentials,
  writeCredentials,
  type Credentials,
  type CredentialService,
} from "./credentials.js";
import type { FigmaOAuthTokens } from "./oauth.js";
import { figmaBrowserAuth } from "./oauth.js";
import { validateFigmaToken, validatePenpotToken } from "./validate-token.js";

/**
 * All prompts resolve through here so an abruptly-closing stdin (piped input ending
 * early, terminal killed) rejects instead of hanging forever and letting the process
 * exit 0 without ever printing a summary.
 */
function settleOnClose<T>(rl: readline.Interface, work: (rl: readline.Interface) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onClose = () => reject(new Error("input stream closed before setup finished"));
    rl.once("close", onClose);
    work(rl)
      .then(resolve, reject)
      .finally(() => rl.off("close", onClose));
  });
}

function makeRl(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/** Streams readHidden operates on — injectable so tests can drive it end-to-end. */
export interface HiddenInputStreams {
  stdin: {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?(raw: boolean): void;
    resume(): void;
    pause(): void;
    on(event: "data", listener: (chunk: Buffer) => void): unknown;
    once(event: "error", listener: (error: Error) => void): unknown;
    removeListener(event: "data", listener: (chunk: Buffer) => void): unknown;
    removeListener(event: "error", listener: (error: Error) => void): unknown;
  };
  stdout: { write(text: string): unknown };
}

/**
 * Reads a secret straight from the TTY in raw mode — deliberately NOT via readline.
 * Readline's keypress state machine turned a plain Ctrl-C into an opaque "stream
 * closed" mid-flow; this path accumulates printable characters itself, renders each as
 * "*", handles backspace, drops every other control byte (^C/^D/^Z can't trigger EOF
 * or signals from inside the mask), and submits only on Enter. Ctrl-C cancels cleanly
 * with an explicit error.
 */
export function readHidden(
  prompt: string,
  streams: HiddenInputStreams = {
    stdin: process.stdin as unknown as HiddenInputStreams["stdin"],
    stdout: process.stdout as unknown as HiddenInputStreams["stdout"],
  },
): Promise<string> {
  const { stdin, stdout } = streams;
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || !stdin.setRawMode) {
      reject(new Error("hidden input requires a TTY"));
      return;
    }

    const wasRaw = stdin.isRaw ?? false;
    // Invoke through the stream object — extracting the method into a local detaches it
    // from its receiver and crashes inside Node's tty internals (`this._handle`).
    try {
      stdin.setRawMode(true);
    } catch (error) {
      if (process.env.WEAVENSIGN_DEBUG) {
        console.error("setRawMode debug:", error);
      }
      reject(new Error(`could not switch the terminal to raw mode (${error instanceof Error ? error.message : String(error)})`));
      return;
    }
    stdin.resume();
    stdout.write(prompt);

    let value = "";

    // Deliberately does NOT pause stdin on the way out: the readline interface created
    // by runSetup owns this stream's flow control, and pausing under it crashes Node
    // internals ("Cannot read properties of undefined (reading '_handle')") once the
    // underlying TTY goes away. Only restore what we changed ourselves.
    const finish = (fn: () => void): void => {
      try {
        stdin.setRawMode?.(wasRaw);
      } catch {
        // Terminal already gone — nothing left to restore.
      }
      stdin.removeListener("data", onData);
      stdin.removeListener("error", onError);
      stdout.write("\n");
      fn();
    };

    const onData = (chunk: Buffer): void => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\r" || char === "\n") {
          finish(() => resolve(value));
          return;
        }
        if (char === "\u0003") {
          finish(() => reject(new Error("cancelled")));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (char >= " ") {
          value += char;
          stdout.write("*");
        }
        // everything else (control bytes) is dropped silently
      }
    };

    const onError = (error: Error): void => finish(() => reject(error));
    stdin.on("data", onData);
    stdin.once("error", onError);
  });
}

async function askYesNo(rl: readline.Interface, question: string, defaultYes: boolean): Promise<boolean> {
  const answer = await ask(rl, `${question} ${defaultYes ? "[Y/n]" : "[y/N]"} `);
  const normalized = answer.toLowerCase();
  if (normalized === "") {
    return defaultYes;
  }
  return normalized === "y" || normalized === "yes";
}

export type ConfigureOutcome =
  | { kind: "none" }
  | { kind: "token"; token: string }
  | { kind: "oauth"; tokens: FigmaOAuthTokens };

export interface ServicePlan {
  service: CredentialService;
  label: string;
  envVar: string;
  askPrompt: string;
  tokenPrompt: string;
  invalidHint: string;
  validate: typeof validateFigmaToken | typeof validatePenpotToken;
  /** Present only for services with a working browser flow — offered as the default path. */
  browserAuth?: () => Promise<FigmaOAuthTokens>;
}

async function pasteLoop(
  rl: readline.Interface,
  plan: ServicePlan,
  readHiddenImpl: typeof readHidden,
): Promise<ConfigureOutcome> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const token = await readHiddenImpl(plan.tokenPrompt);
    if (token === "") {
      console.log(`Skipped ${plan.label}.\n`);
      return { kind: "none" };
    }
    process.stdout.write(`Validating ${plan.label} token... `);
    const result = await plan.validate(token);
    if (result.ok) {
      console.log(`ok (${result.value.account})\n`);
      return { kind: "token", token };
    }
    if (result.error.kind === "network") {
      console.log(`could not reach the network (${result.error.cause}).`);
      break;
    }
    console.log(
      attempt < 3
        ? `${plan.label} rejected that token (HTTP ${result.error.status}). Try again.`
        : `${plan.label} rejected that token (HTTP ${result.error.status}). ${plan.invalidHint}.`,
    );
  }
  return { kind: "none" };
}

function describeOAuthFailure(error: unknown): string {
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

export async function configureService(
  rl: readline.Interface,
  plan: ServicePlan,
  deps: { readHiddenImpl?: typeof readHidden } = {},
): Promise<ConfigureOutcome> {
  const readHiddenImpl = deps.readHiddenImpl ?? readHidden;
  if (!(await askYesNo(rl, plan.askPrompt, true))) {
    return { kind: "none" };
  }

  if (plan.browserAuth) {
    const answer = await ask(
      rl,
      `Use [1] browser login (${plan.label} opens and you approve once) or [2] paste a personal access token? [1] `,
    );
    if (answer === "" || answer === "1") {
      try {
        process.stdout.write(`Waiting for ${plan.label} authorization... `);
        const tokens = await plan.browserAuth();
        // Best-effort account display; the exchange already proved the token works.
        const verified = await validateFigmaToken(tokens.accessToken, fetch, "oauth");
        console.log(verified.ok ? `connected (${verified.value.account})\n` : `connected.\n`);
        return { kind: "oauth", tokens };
      } catch (error) {
        console.log(`${plan.label} browser login failed: ${describeOAuthFailure(error)}.`);
        console.log("Falling back to pasting a personal access token.\n");
      }
    }
  }

  return pasteLoop(rl, plan, readHiddenImpl);
}

const PLANS: ServicePlan[] = [
  {
    service: "figma",
    label: "Figma",
    envVar: "FIGMA_TOKEN",
    askPrompt: "Configure Figma access?",
    tokenPrompt: "Paste your Figma personal access token (figma.com → Settings → Personal access tokens): ",
    invalidHint: "Create one at https://www.figma.com/developers/api#access-tokens",
    validate: validateFigmaToken,
  },
  {
    service: "penpot",
    label: "Penpot Cloud",
    envVar: "PENPOT_TOKEN",
    askPrompt: "Configure Penpot Cloud access?",
    tokenPrompt: "Paste your Penpot access token (design.penpot.app → account settings → Access tokens): ",
    invalidHint: "Create one at https://design.penpot.app/#/settings/access-tokens",
    validate: validatePenpotToken,
  },
];

function applyOutcome(credentials: Credentials, service: CredentialService, outcome: ConfigureOutcome): boolean {
  if (outcome.kind === "none") {
    return false;
  }
  if (service === "figma") {
    credentials.figmaToken = outcome.kind === "oauth" ? outcome.tokens.accessToken : outcome.token;
    if (outcome.kind === "oauth") {
      if (outcome.tokens.refreshToken !== undefined) {
        credentials.figmaRefreshToken = outcome.tokens.refreshToken;
      }
      if (outcome.tokens.expiresAt !== undefined) {
        credentials.figmaExpiresAt = outcome.tokens.expiresAt;
      }
      credentials.figmaAuthKind = "oauth";
    } else {
      // A manually-pasted PAT replaces any previous OAuth session's refresh state.
      delete credentials.figmaRefreshToken;
      delete credentials.figmaExpiresAt;
      credentials.figmaAuthKind = "pat";
    }
    return true;
  }
  if (outcome.kind === "token") {
    credentials.penpotToken = outcome.token;
    return true;
  }
  return false;
}

function hasCredentialFor(credentials: Credentials, service: CredentialService): boolean {
  return service === "figma" ? credentials.figmaToken !== undefined : credentials.penpotToken !== undefined;
}

/**
 * Interactive onboarding: Figma connects via browser OAuth by default (paste kept as a
 * fallback), Penpot via paste (its API has no third-party OAuth yet). Everything is
 * live-validated before being merged into ~/.weavensign/credentials.json (0600).
 */
export async function runSetup(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error("Interactive setup needs a terminal. For non-interactive use, set FIGMA_TOKEN / PENPOT_TOKEN in the server's environment instead.");
    process.exitCode = 1;
    return;
  }

  const stored = await readCredentials();
  const clientId = process.env.FIGMA_CLIENT_ID ?? stored.figmaClientId;
  const clientSecret = process.env.FIGMA_CLIENT_SECRET ?? stored.figmaClientSecret;

  const plans: ServicePlan[] = PLANS.map((plan) =>
    plan.service === "figma" && clientId && clientSecret
      ? {
          ...plan,
          browserAuth: () => figmaBrowserAuth({ clientId, clientSecret }),
        }
      : plan,
  );

  console.log("weavensign setup");
  console.log("----------------");
  console.log(`Credentials are stored in ${configDir()}/credentials.json (file permissions 0600).`);
  if (!clientId || !clientSecret) {
    console.log(
      "Browser login for Figma needs an OAuth app (free): create one at https://www.figma.com/developers/apps,\n" +
        "add redirect URL http://localhost:55887/callback, then export FIGMA_CLIENT_ID / FIGMA_CLIENT_SECRET.\n" +
        "Until then, paste a personal access token below.\n",
    );
  }
  console.log("Environment variables (FIGMA_TOKEN / PENPOT_TOKEN) always take precedence over stored credentials.\n");

  const rl = makeRl();
  try {
    await settleOnClose(rl, async (activeRl) => {
      const credentials: Credentials = { ...stored };
      let hasAnyToken = false;
      let changed = false;

      for (const plan of plans) {
        const outcome = await configureService(activeRl, plan);
        changed = applyOutcome(credentials, plan.service, outcome) || changed;
        hasAnyToken = hasCredentialFor(credentials, plan.service) || hasAnyToken;
      }

      if (changed) {
        await writeCredentials(credentials);
      }

      if (!hasAnyToken) {
        console.log("Nothing connected. The MCP server will still classify and render designs passed inline.");
        process.exitCode = 1;
        return;
      }

      console.log("Saved. Connect the server to an MCP client:");
      console.log("  claude mcp add weavensign -- npx -y @weavensign/mcp-server");
      console.log("or point any MCP client at the same command over stdio.");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "cancelled") {
      console.log("Cancelled — nothing new was saved unless a step completed before this.");
    } else {
      console.error(`Setup did not complete: ${message}`);
    }
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}
