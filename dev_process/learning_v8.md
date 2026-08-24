### 053 — Browser OAuth for Figma (paste kept as fallback); a "hang" that was the user's Ctrl-C, and an unbound-method bug the unit tests couldn't see

**What happened:** User cancelled setup mid-paste ("not interested") and asked for real
browser OAuth instead. Two takeaways from the investigation: the earlier "input stream
closed" failure was THEIR OWN Ctrl-C all along — readline turned SIGINT into an opaque
close; the replacement raw-mode reader now reports "cancelled" explicitly and drops all
other control bytes (^D can no longer end anything). OAuth itself: authorize URL with
PKCE S256 + state → loopback callback on http://localhost:55887/callback (must be
registered verbatim on the user's free Figma app) → exchange at POST /v1/oauth/token
(Basic auth) within Figma's 30-second code window → 90-day access token + reusable
refresh token stored client-side; runtime refreshes proactively near expiry and
reactively on one 401 retry (single-flight guard because each refresh invalidates the
previous access token). Verified live: fake code through the loopback gets a REAL 400
from api.figma.com, then automatic fallback to paste.

The debugging journey earned its keep: the fallback paste prompt crashed with Node's
"Cannot read properties of undefined (reading '_handle')" INSIDE tty.setRawMode.
Instrumenting showed stdin perfectly healthy (`_handle` object present) — the actual bug
was mine: `const setRawMode = stdin.setRawMode` detached the method from its receiver,
so `this` was undefined at call time. Unit tests missed it twice over: PassThrough-based
streams shim `setRawMode` as a plain function (no receiver semantics), and vitest never
exercises a real TTY. Also learned expect's `log_user 0` silently eats spawn output —
the first debug stack trace never reached the log.

**Lesson:** (1) When a stream API throws inexplicable internal errors, check HOW you're
calling it before WHAT state it's in — bound-vs-unbound methods fail with misleading
state-shaped errors. (2) Fake-stream unit tests verify LOGIC, not OS integration; only a
pty run exercises real TTY semantics, so interactive CLIs need both layers. (3) OAuth
token lifetime is a runtime concern, not just a setup-time one: storing the refresh
token next to the access token turns "connect once" from marketing into mechanics.

### 054 — Seamless first-run: the MCP tool itself triggers browser OAuth on missing credentials

**What happened:** User asked why connection couldn't be triggered FROM the client —
fair: stdio servers can't do spec-level OAuth handshakes, but they run locally and CAN
open a browser. New `src/connect-figma.ts`: when `get_figma_design` hits missing-token,
it calls `ensureFigmaConnected()` — resolves OAuth app creds (env > store), runs the
same loopback flow as setup (single-flight so parallel tool calls share one tab),
persists the session, then the tool transparently retries its fetch. All progress output
moved to stderr BEFORE this existed in server context — console.log would have corrupted
the stdio protocol channel mid-conversation. WEAVENSIGN_NO_BROWSER=1 disables for CI.

Two test lessons: mocking `ensureFigmaConnected` to "succeed" made my retry assertion
fail because the mock stores no real credentials — the retried fetch legitimately
returns missing-token again; assert that the path ENGAGED (call count), not downstream
symptoms. And the env-var-wins case needed its own test since FIGMA_TOKEN presence must
skip auto-connect entirely.

**Lesson:** "Seamless" for local MCP tools doesn't require protocol auth support — it
requires the server process treating missing-credentials as a recoverable state with a
side effect (browser) plus one transparent retry. The constraint that shaped everything:
stdout is never yours in a stdio server, not even for helpful messages.
