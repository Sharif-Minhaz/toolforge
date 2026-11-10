# Security

The baseline, then the doctrines that were learned building the tools which
actually reach the network.

---

## Baseline

- Validate all input. Never trust the client. Zod at every boundary — see
  [`server-and-data.md`](server-and-data.md#validation).
- Escape user content.
- Never expose secrets. Never commit credentials.
- Use secure cookies.
- Apply CSRF protection where appropriate.
- Follow OWASP best practices.

---

## Decide which way a gate fails

Every other degradation on this site falls **toward doing the work**: no
Turnstile key and a tool renders disabled, no database and the shortener says so.

A limiter inverts that. No `DATABASE_URL`, no salt, an unreachable database, a
thrown transaction — every one of them **refuses**.

```
What happens if this gate is bypassed?
├─ A reader loses a convenience        → fail open. Degrade toward working.
└─ The service becomes something we
   would not have shipped
   (unmetered scanning, unbounded
   writes, an open relay)              → fail closed. Refuse.
```

**A limiter that can fail open is not a limiter.** See
[`case-studies/port-scanner.md`](case-studies/port-scanner.md), where `spendQuota`
is the worked example.

---

## Rate limiting and quotas

The rules, all learned in `port-scanner` and reused by every studio through
`tools/domain/rate-window.ts` and `tools/repository/rate-counter.ts`:

- **In Postgres, not in memory.** On serverless a per-process counter resets on
  every cold start and each instance counts separately. Shipping one under the
  name "rate limit" is worse than shipping none, because it stops anyone looking
  again.
- **Read and write in one transaction.** Two visitors behind one address arrive
  together; a read-then-write lets both see nine and both write ten.
- **Spend the allowance even when the operation fails.** A refused request that
  costs nothing is a free retry loop, and retrying is what an abuser does.
- **Store a salted hash of the address, never the address.** The row answers "is
  this the same caller" and nothing else. Unsalted, a table of SHA-256 digests of
  IPv4 addresses is reversible by brute force in seconds — there are only four
  billion. The salt is a secret for that reason, and rotating it resetting every
  window is the correct failure.
- **A fixed window, not a sliding one.** Sliding needs every timestamp kept, and
  a per-scan history of who scanned when is a log this site has no business
  holding. The cost — a caller can spend the tail of one window and the head of
  the next — is written down in `domain/quota.ts` rather than discovered.

**An upstream per-IP limit is not a per-visitor limit here.** A worker sees this
server's address, not the reader's, so its per-IP rule becomes a per-deployment
rule. Never describe it as if it were per visitor — see
[`case-studies/watermark-remover.md`](case-studies/watermark-remover.md).

---

## Ordering the gates

Order by what each one costs. The full ladder is in
[`engineering-principles.md`](engineering-principles.md#ordering-gates-by-cost).
Two consequences worth restating here:

- **Turnstile comes before the quota**, or a script burns a stranger's allowance
  by replaying their address without solving anything.
- **The quota comes before the network**, because it is the only gate that limits
  _volume_.

---

## Reaching a host somebody typed

Any tool that connects to an address a stranger chose is an SSRF surface before
it is a feature. The full doctrine — resolve first then connect to the address
you checked, guard every redirect hop, and the range list that is longer than the
three everybody remembers — is in
[`patterns/outbound-requests.md`](patterns/outbound-requests.md).

**Build the guard before the feature.** The Mock Server's outbound node was built
**last on purpose**: when a feature turns user configuration into an outbound
request, ship everything else first and let the guard stack be the gate on the
feature rather than a follow-up ticket.

**Close the surface by construction, not by a flag.** A capability that is absent
cannot be forgotten; a boolean can.

---

## Serving content a stranger authored

- **A public response body needs an allowlist, not a warning.** Default-deny the
  content type — JSON, plain text, XML, CSV — and collapse anything outside it to
  `text/plain`. An endpoint that can answer `text/html` can serve a sign-in page
  under this site's name.
- **Pair it with `nosniff` and `Content-Security-Policy: sandbox`**, and apply
  author-supplied headers _before_ the security set is re-applied, or one `set`
  overwrites the protection.
- **Decode a path segment once, and only after splitting.** Decoding first turns
  a `%2F` into a separator and splits one segment into two, which is how a
  traversal gets through a router that reads as correct.

See [`case-studies/mock-server.md`](case-studies/mock-server.md).

---

## User-creatable redirects

A user-creatable redirect is an abuse surface before it is a feature. Four things
are load-bearing together, and without all four the service is a phishing host
that happens to shorten URLs:

1. Creation sits behind Turnstile.
2. Destinations are `http:`/`https:` only.
3. Aliases that read like a lure (`login`, `verify`, `secure`, …) are reserved.
4. A short link may not point at another short link on this host — on either
   prefix.

Header-level rules for the redirect itself are in
[`case-studies/short-links.md`](case-studies/short-links.md).

---

## Bounding a public query language

A REST fixture's cost lives in the server's route table. A GraphQL endpoint moves
it to the caller's query, and derived relations are cyclic by construction — so
depth, breadth and root-field count each need their own bound, plus a separate
bound on the _analysis_ itself. See
[`case-studies/graphql-server.md`](case-studies/graphql-server.md).

---

## Regular expressions in shared tables

**No `g` flag on any pattern held in a module-level table.** A `RegExp` with
`lastIndex` is mutable state shared by every request the server handles. See
[`case-studies/domain-inspector.md`](case-studies/domain-inspector.md).

---

## Randomness

A seeded generator is for reproducibility (`sfc32` behind an avalanche hash of a
string seed). Anything that must be **unguessable** — a token, a recovery key, a
password — comes from `crypto.getRandomValues`, never from a seeded source and
never from `Math.random`.

---

## Storing a credential in the reader's browser

If a tool keeps something that grants access — an edit URL, a recovery key — say
so in the UI, cap the list, and give it a button that empties it. Do it quietly
and the tool is a credential store that never admitted to being one. See
[`patterns/browser-persistence.md`](patterns/browser-persistence.md).

## Gating a hosted server's public address

The Mock, JSON and GraphQL studios each answer strangers' programs at a public
address — `/m/<key>`, `/j/<key>`, `/g/<key>`. The studio cookie cannot protect
that address: the callers are Postman, `curl` and front ends on other origins,
none of which carry it. So the address gets its own credential, an **access
token** sent as `X-ToolForge-Key`. The shared logic is
`src/modules/tools/domain/access-token.ts`.

**Never reuse the recovery key or the cookie secret for this.** Both grant edit
rights over the server itself. The access token is meant to be pasted into
`.env` files and sometimes front ends, so it grants only what the public address
already answers, and Rotate takes it back.

What makes it hold:

- **The check sits inside `handle*Request`, not in the route file.** Every way
  in — the route's seven method exports, and `proxy.ts` serving `QUERY` for the
  mock studio — has to pass through the handler to reach a row. A new entry
  point that skips the handler skips the gate.
- **Order: shape → rate limit → row lookup → token → pause → data.** The token
  check comes before the pause check and before route matching, so a caller
  without it learns neither whether the server is on nor which paths it has.
  The rate limit comes first, so guessing tokens is metered (they carry about
  165 random bits anyway).
- **Fails closed.** The database default is `PRIVATE`, so a creation path that
  forgets the column produces a locked server rather than an open one. A
  `PRIVATE` row with no digest refuses every token. The migration that added the
  column kept existing servers `OPEN`, so no running integration broke.
- **Stored as a digest** (`hashCredential`), compared with `timingSafeEqual`,
  shown once at issue. The studio never holds the token after that.
- **Two refusals, two names**: `token_required` (no header) and
  `token_invalid` (wrong, malformed, rotated away, or never issued). Both 401.
- **A preflight passes without it.** Browsers never attach custom headers to an
  `OPTIONS` preflight; refusing it would make a private server uncallable from
  any browser. A refused preflight is answered from the static CORS set, with no
  route information.
- **Not a header the mock author's graph can see.** The mock handler strips
  `X-ToolForge-Key` before building the request the graph reads, so a graph
  that echoes headers cannot bounce the token into a response body or the
  request log. It is a separate header from `Authorization` because mock
  endpoints model `Authorization` themselves.

**The one place a second credential is accepted:** the GraphQL endpoint takes
the owner's studio cookie when no token header is sent. The studio's Run button
deliberately calls the real public endpoint (see
`graphql-server/validation/index.ts`), and the studio only holds a digest. This
is safe because the cookie is `SameSite=Lax` — no other site's `fetch` sends
it — and a top-level `GET` that does carry it cannot run a mutation and cannot
be read by the page that caused it. Do not copy this to a handler whose `GET`
has side effects.

**What it cannot do:** a token shipped inside a public front end can be read by
anyone who opens that front end. The panel says so; the remedy is a backend that
holds the token, or Rotate.
