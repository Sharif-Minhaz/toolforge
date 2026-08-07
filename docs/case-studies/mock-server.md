# Mock Server Studio

`src/modules/mock-server/` serves HTTP responses whose shape a stranger authored,
on addresses a stranger chose.

The full system design — storage, identity, the graph engine, the execution
engine, logs, milestones — is [`../mock-server-studio.md`](../mock-server-studio.md).
This file holds the parts that generalise past the studio, plus the pointers to
the patterns it established.

Patterns lifted out of this module:

- [`../patterns/tree-editors.md`](../patterns/tree-editors.md) — the value editor.
- [`../patterns/input-suggestions.md`](../patterns/input-suggestions.md) — the
  path picker.
- [`../patterns/outbound-requests.md`](../patterns/outbound-requests.md) — the
  outbound node's guard stack.

---

## Route matching has three answers, not two

A path that exists **under another method** is `405` with an `Allow` header, and
it is a different fact from a path that does not exist. Most hosted mock servers
fold them together, and a client debugging an integration then cannot tell a typo
from a missing handler.

- **HEAD falls through to GET with the body stripped**, because HTTP defines it
  that way and making authors maintain both is two things to keep in step.
- **An undefined `OPTIONS` is answered from what the path supports**, because it
  is a preflight.

## Rank on a number computed at write time, never by parsing at read time

`specificity` is a base-3 number, one digit per segment — 2 static, 1 parameter, 0
wildcard — read left to right and **right-padded to `MAX_PATH_SEGMENTS`**.

The padding is the part that is easy to miss and is what makes patterns of
different lengths comparable, which they must be: a wildcard pattern is always
shorter than the paths it matches.

Two consequences fall out:

- **The ceiling on segments is load-bearing**, because `3 ** MAX_PATH_SEGMENTS`
  has to fit in the Postgres `INTEGER` the column is.
- **Ties need a deterministic second key** — `/a/:x` and `/a/:y` score identically,
  and without one the winner would depend on the order Postgres happened to return
  rows in, which can differ between replicas.

## Decode each path segment once, and only after splitting

Decoding first turns a `%2F` into a separator and splits one segment into two,
which is how a traversal gets through a router that reads as correct.

A malformed escape is kept as its **literal text** rather than failing the request
— `decodeURIComponent` throws on a lone `%`, and a 400 nobody asked for is a worse
answer than matching the characters that were actually sent.

---

## A public response body written by a stranger needs an allowlist, not a warning

While execution shares an origin with the rest of the site, an endpoint that can
answer `text/html` can serve a sign-in page under this site's name.

`content-type.ts` is **default-deny** — JSON, plain text, XML, CSV — and a value
outside it collapses to `text/plain` rather than being refused, because the
response is still worth serving, just not under a type that makes it executable.

Pair it with `nosniff` and `Content-Security-Policy: sandbox` on every response,
and note in the route handler that **author-supplied headers are applied _before_
the security set is re-applied**, or one `set` overwrites the protection.

## `proxy.ts` runs on everything, including routes that must not pay for it

The matcher catches every non-static path, so a public API route would get a
Supabase session refresh and a `Set-Cookie` for this site's auth written onto its
response.

The prefix check has to live **inside the proxy function**, because
`config.matcher` values must be build-time constants.

---

## Related

- [`json-server.md`](json-server.md) and
  [`graphql-server.md`](graphql-server.md) — the two studios that share this one's
  identity, metering and document layers.
- [`../architecture.md`](../architecture.md#worked-example-two-the-three-studios-which-moved-twice)
  — what moved into `tools/`, and what deliberately did not.
