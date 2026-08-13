# The MCP server

`src/modules/mcp/` · `/api/mcp` · the guide at `/mcp`

The Model Context Protocol endpoint is the first thing on this site whose caller
is not a person and not our own UI. Everything below is what that turned out to
change.

---

## What it is, in this repository's terms

An MCP client — Claude Code, Claude Desktop, a claude.ai connector, a ChatGPT
connector, Cursor — connects, asks what tools exist, and from then on the model
may call them with arguments it chose. So the endpoint is a Route Handler
(rule 22: the caller is somebody else's program), and the tools it publishes are
adapters over the existing `domain/` layer.

That last part is the whole design. **No MCP tool contains logic.** Every one of
them parses its arguments, calls the same function the tool page calls, and maps
the result. An answer over MCP and an answer on the page cannot disagree,
because there is only one implementation of each.

```
src/modules/mcp/
  domain/        protocol-free: naming, gates, limits, outcome shapes
  tools/         one adapter per exposed operation, plus the index that lists them
  repository/    the SDK wiring, the rate limiter, the request handler
  components/    the guide page's panels
  tests/         invariants, gates, and a protocol test driven by the SDK's own client
```

---

## Decisions worth keeping

### Depend on the SDK, not on our own JSON-RPC

Decision tree 45: somebody else reads the output, so depend on the reference
implementation. `@modelcontextprotocol/sdk` owns the envelope, the handshake,
capability negotiation and the Zod-to-JSON-Schema conversion the client actually
consumes. What we own is the part above it — which tools exist and what they do.

`WebStandardStreamableHTTPServerTransport` takes a `Request` and returns a
`Response`, so it drops straight into a Route Handler with no Node-stream shim.

### Stateless, because serverless

`sessionIdGenerator: undefined`. A session held in one instance's memory is gone
when that instance recycles, and a client holding its id would get a 404
mid-conversation. The cost is that server-initiated notifications are
impossible, which costs nothing: no tool here is asynchronous to its caller.

A fresh `McpServer` per request follows from that, and so does the `finally` that
closes it.

### Buffer the response before closing the server

`server.close()` cancels the transport's stream. Handing that stream back as the
response body truncates it — under load, when the close wins the race. The
handler does `await response.text()` first. `enableJsonResponse` means that is
one small object.

### Two gates, in opposite directions

| Gate | Applies to | Fails |
| --- | --- | --- |
| Rate limit | every call | closed |
| Bearer token | `kind: "network"` tools only | closed, in both senses |

The rate limit fails closed for the reason `docs/security.md` gives: an
unmetered public execution path is a scriptable way to spend a deployment's
budget, and this one will run Argon2 and generate 4096-bit RSA keys on request.
No `DATABASE_URL`, no `MCP_IP_SALT`, no endpoint.

The token gate is **per tool, not per request**. Per request would mean either
locking the whole endpoint behind a secret — costing every offline tool the
reason it is open — or leaving the networked one exposed. Per tool is the only
arrangement where "encode this base64" needs nothing and "inspect this domain"
needs the token.

It also refuses when *no token is configured*, not just when the wrong one is
sent. A gate that opens because an environment variable is blank is not a gate.

### The Turnstile substitution

On the page, the Domain Inspector is protected by a Turnstile challenge — a
human proof spent before anything leaves the server. An MCP client cannot solve
one. So the challenge is **replaced rather than dropped**: the bearer token is
the proof instead. Same question, same answer, different evidence.

That is the pattern for any future networked tool here. Do not expose one
without deciding what stands in for the challenge.

### Naming is built, never written

`toolforge_<tool>_<verb>`, from `buildMcpToolName`. A client shows every
connected server's tools in one list and the model picks by name alone, so
`hash` and `diff` would collide with half the servers in existence. The
catalogue id comes second so an alphabetical list groups a tool's operations
together.

`tests/registry.test.ts` enforces the shape. A hyphen in a name type-checks and
is rejected by clients.

---

## Traps this hit

**The text block has to carry the whole answer.** This one shipped, and it made
every tool useless in one client while looking perfect in another.

`CallToolResult` has two places an answer can go: `content`, a list of blocks,
and `structuredContent`, an object. The first version put `summary` in the text
block and the real payload in `structuredContent` only. Clients do not agree
about which to read. Claude Code surfaced `structuredContent`, so every test and
every manual check passed. The claude.ai connector surfaced `content` alone — so
a model asked to encode a string was handed the literal text `Encoded 20 bytes`,
concluded the tool had returned nothing usable, and did the work itself by hand.
Every call succeeded; every result was worthless.

The specification says a tool returning structured content SHOULD also return
the serialized JSON in a text block, and that SHOULD is not decorative. Both
fields now carry the same object.

The test that was supposed to catch this is the reason it shipped:

```ts
expect(block?.text).toBe("hello-world");   // asserted the bug, and passed
```

It asserted what the code did rather than what a client needs. Its replacement
parses the text block and requires it to equal `structuredContent` — a
requirement no implementation detail can satisfy accidentally.

**`server-only` in the import graph makes the registry untestable.** The Domain
Inspector's `runInspection` is marked `server-only`, and importing it statically
put that marker in the graph of `tools/index.ts` — which the tests load outside
a server runtime. Fixed by importing it *at the point of use* inside the
handler, which keeps one array in `tools/index.ts` and keeps that array
testable.

`repository/server.ts` carries no `server-only` marker either, and that is
deliberate — `tests/protocol.test.ts` drives it with the SDK's own client, which
it could not do if the module refused to load. It holds no database client and
no secret store; the marker stays on `handle.ts` and `rate-limit.ts`, which do.

**A tool that draws randomness has to return what it drew.** The AES adapter
mints a salt and an IV when encrypting, exactly as the page does. On the page
the reader can see those fields; an MCP caller cannot. Without returning them,
an encryption over MCP would be unreadable by anything — including this tool a
second later — and it would look like it had worked.

**A structured result can flood a context window.** The Diff adapter returns a
unified patch rather than the row array the page renders, because two
thousand-line documents produce two thousand rows of which ninety per cent are
unchanged. `git apply` already solved this format.

**Optional Zod fields arrive as `undefined`.** Every argument a tool does not
require must carry a `.default()`, or the handler receives `undefined` where it
expects a value — a crash rather than a refusal. `tests/registry.test.ts`
asserts this across the whole registry.

**`t.rich` message keys must stay literal unions.** The tool table narrows with
`tool.toolId === "catalog"` rather than by looking the id up, because the
narrowing is what keeps `tools.<id>.name` checkable at compile time.

---

## What is not exposed, and why

Not gaps. Each one is a fact about the tool.

- **Image tools** (compressor, converter, resizer, blur placeholder) — they
  decode pixels in a canvas and re-encode through browser-targeted WebAssembly
  codecs. No canvas in a request handler, and a server-side reimplementation
  would be a second encoder to keep in step with the first.
- **The studios and the shortener** — each mints a public address and stores
  what is posted to it, with ownership proved by a browser cookie. An MCP client
  has no cookie jar, so creating one here would mint something nobody could
  reclaim.
- **The AI tools** — they spend a third-party API budget per call. A decision
  about money, belonging to whoever pays.
- **The port scanner** — its function is to touch somebody else's host on ports
  they did not offer. Behind a model that can be talked into things, a token is
  not the protection it looks like.

`toolforge_catalog_list` returns the web address of every one of them, so an
assistant asked to compress a photograph sends the reader to the page rather
than reporting that ToolForge cannot.

---

## The promise this breaks, and where that is said

Every tool page does its work in the tab. MCP does not: arguments travel to the
server, and the networked tool reaches out from here. That is a limitation the
site's own front page implicitly denies, so rule 32 applies — the disclosure
sits above the controls on `/mcp`, not in an article underneath, and the
`password_generate` and `jwt_sign` descriptions repeat it where it matters most.

---

## Adding a tool to it

See `docs/workflow/adding-a-tool.md`, step 8b. The short version: if the new
tool's domain layer runs on the server, it gets an adapter in
`src/modules/mcp/tools/`, an entry in `MCP_TOOLS`, and nothing else — the guide
page's table, the tool count and the tests all read the registry.
