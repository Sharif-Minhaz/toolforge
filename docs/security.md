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
