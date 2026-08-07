# GraphQL Server Studio — Publishing a Schema Somebody Else Will Generate Code From

`src/modules/graphql-server/` derives a GraphQL schema from a stored `db.json` and
serves it.

Five things generalise past this tool, and the first two are the ones most likely
to be got wrong somewhere else.

---

## A derived name is a published contract, so print it beside what it came from

The REST studio also singularises — `posts` → `postId` for `_embed` — and its own
comment says the inflector is deliberately naive, because a wrong guess there
costs one embed that comes back empty.

Here the same guess becomes a **type name**: it goes into the SDL, into every
introspection response, into whatever `graphql-codegen` wrote, and into the source
of everyone who consumed the API before anybody noticed.

So `naming.ts` carries the irregulars — and, because **no inflector is ever
complete**, the studio prints the derived name next to the document key for every
resource. That is what turns a wrong guess from something a consumer finds in
generated code into something the author sees first.

The same applies to every repair: a hyphen becoming a camel hump and a leading
digit gaining an underscore are both **reported**, never done quietly.

## Infer a published type from all the data, not a sample

`fieldsOf` in the REST studio samples fifty records, and that is right there — the
list is a hint for writing a query. Here the answer becomes the schema, and a type
inferred from fifty records that record four thousand contradicts is a schema its
own data fails to validate against.

Two specification facts fall out and both are easy to miss:

- **GraphQL's `Int` is 32-bit**, so a larger whole number must be `Float` or it
  throws at response time rather than rounding.
- **A field that is a string in one record and a number in another is the `JSON`
  scalar**, not the wider of the two — there is no type that is both, and
  pretending otherwise moves the failure from the schema, where it is visible, to
  a 500.

---

## A public GraphQL endpoint needs three bounds, and each catches what the others miss

This is the whole security difference from a REST fixture: GraphQL moves a
request's cost from the server's route table to the caller's query, and derived
relations are **cyclic by construction** — a `Post` has `comments` and every
`Comment` has a `post`.

| Bound | Stops |
| --- | --- |
| Depth | the cycle |
| Estimated node count, multiplied down the tree from each list field's page size | breadth |
| Root-field count | `a: posts b: posts c: posts …`, which adds no depth and no estimated cost |

All three run **before a single resolver**, because the point is to refuse the
work rather than measure it. Three rules make them actually hold:

- **A page-size default is load-bearing, not cosmetic.** The estimator can only
  multiply because every list field has a size it cannot exceed. Remove the
  default and every list has to be assumed at its maximum, which refuses ordinary
  two-level queries.
- **Read the page size from variables too.** A bound a `$perPage` could slip past
  is no bound at all, and every real client sends variables.
- **Bound the analysis separately from what it estimates.** Fragment spreads add
  no depth and no estimated cost but multiply the _walk_: thirty acyclic fragments
  each spreading the next twice is 2³⁰ visits, and the query-length cap leaves
  room for hundreds. Without `MAX_ANALYSIS_NODES` the function whose job is to
  refuse expensive queries is itself the expensive query. `NoFragmentCycles` does
  **not** catch this — nothing here is cyclic.

## Run validation before your own analysis, not alongside it

`specifiedRules` is what rejects a fragment that spreads itself, and the guard's
walker follows spreads — so a walker running as a validation rule would not
terminate on a document anybody can send.

Two ordered steps, with a comment at each saying why.

## Exempt introspection, and say so

`__schema` walks the schema, which is bounded by a document already capped at a
megabyte, so its cost is bounded by something this server controls.

Charging it the per-level multiplier refuses the standard introspection query
outright — GraphiQL's is around nine levels deep — and an endpoint no IDE, no
codegen tool and no `apollo client:download-schema` can read has lost most of its
point.

---

## Three smaller rules the module settled

- **Split the engine at "does this write".** The REST studio reads that from the
  HTTP method; **every GraphQL request is a `POST`**, so only the parsed operation
  knows. `planRequest` does exactly that much work and hands the AST on, so the
  document is parsed once and a query never pays for a row lock.
- **Honour `GET` as safe.** The GraphQL-over-HTTP specification reserves it for
  reads, and honouring that is what stops a link — in an email, in a crawler's
  queue, in a chat client's preview fetcher — from writing to somebody's fixture.
  It is a property of the _transport_, so it arrives on the request rather than
  being decided by the engine.
- **A studio's own runner must not be a privileged client.** The query editor
  posts to the real endpoint from the browser rather than through a Server Action.
  The Action would skip the transport rules, the rate limit and the `GET`/`POST`
  split, so a query that worked on the page could fail from `curl` — and the studio
  would be the one place the endpoint's own rules did not apply.

---

## A hand-written printer needs the reference parser to check it

`renderSdl` is hand-written on purpose, so the SDL can be shown and downloaded
without pulling `graphql-js` into the client bundle — which leaves the obvious
failure: a printer that agrees with itself and with nothing else.

So `sdl.test.ts` parses the printed text with `graphql-js`'s own parser and
compares the result against the schema built directly from the same model, both
canonicalised through `lexicographicSortSchema` with descriptions stripped.

That is the QR encoder's rule applied to a printer, and it earned its keep
immediately: it found that `{"posts": []}` and `{"profile": {}}` both produced a
**type with no fields**, which is a GraphQL syntax error — so the most natural way
to start an empty server produced an endpoint that refused every request,
introspection included.

---

## Related

- [`json-server.md`](json-server.md) — the same document served as REST.
- [`../patterns/growth-ceilings.md`](../patterns/growth-ceilings.md)
- [`../testing.md`](../testing.md#verifying-against-something-that-is-not-you)
