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

## An importer that builds a document and hands it to a writer which ignores it

`readOpenApi` built a whole `GraphDocument` per operation — the response shaped
from the schema, an editable value tree, the status code. `importOpenApi` then
called `insertEndpoint`, whose `InsertEndpointRow` had **no graph field at all**,
and which created every row with `createDefaultGraph()`.

So every imported route answered `{"message":"Hello from ToolForge"}`, while the
panel above it promised "a response shaped from its schema". Nothing failed. The
tests passed, because they asserted on `readOpenApi`'s return value, which was
correct — the loss happened one layer down, in the gap between a function that
produces something and a function that never took a parameter for it.

**A producer with no consumer is a defect the type system will not find**, and
the shape that hides it is an options object with a sensible default: `graph`
absent means "the default one", which is exactly what pressing _Add route_ wants
and exactly what made its absence invisible.

The check that would have caught it is the one now in `openapi.test.ts`: execute
the graph _that was stored_ and assert on the bytes, rather than on the object
the mapper returned.

## A required header is not a condition; ten of them are not ten conditions

An OpenAPI operation declares more than a response. bKash's recurring-payment
gateway wants `version`, `channelId` and `timeStamp` on every call and seven
required fields inside the subscription body, and the importer read none of it —
so a mock of a gateway that refuses without a header cheerfully answered 200 to
an empty request, and the only fix was to hand-build ten `condition` nodes per
route across ten operations.

Two things came out of that, and the split between them is the part worth
keeping:

- **`validate`** is the enforcement: a list of fields on one node, `pass`/`fail`
  like `auth`, every field checked rather than the first failure, and the missing
  names written to a variable so the refusal can name them. See
  [`../mock-server-studio.md`](../mock-server-studio.md#53a-validate-and-why-it-is-not-three-condition-nodes).
- **`declared`** on the entry node is the _description_: what the document said,
  enforced by nothing, read by the path pickers so an imported route offers
  `payer` and `channelId` before anybody has called it once.

Folding the two together would have been smaller and wrong. A description that
silently enforced would refuse requests nobody could see a reason for; an
enforcement with no description would leave the pickers as empty as before.

**The generated guard costs the quick body form.** Two response nodes means
`hasSingleResponse` is false, so the route page steps aside and points at the
flow editor — correctly, since there is no honest single-body view of a branching
route. That is a real trade and it is why the switch in the import panel exists.

## An example is worth more than a placeholder specification

The document a reader reaches for first is the petstore, which declares nothing
required, carries no headers, and produces routes that answer 200 to anything —
the one shape this importer has least to show on. `domain/example-specs.ts` ships
a real payment gateway instead, held as text because the box it fills is a paste
box and what lands in it should be the characters somebody would have pasted.

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
