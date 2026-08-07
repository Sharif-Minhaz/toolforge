# Server Architecture and Data Access

Where a request goes, and who is allowed to touch the database.

---

## The request path

Prefer, in this order:

```
Server Components
    ↓
Server Actions
    ↓
Route Handlers
```

### When a Route Handler is justified

Only when the work genuinely needs one:

- webhooks
- uploads
- streaming
- external APIs
- third-party callbacks

Do not create unnecessary REST endpoints.

```
Does a page render the result?
├─ Yes → Server Component.
└─ No.
   Is the caller our own UI?
   ├─ Yes → Server Action.
   └─ No — it is somebody else's browser, a camera app, a crawler, a client
            library, or a webhook.
            → Route Handler, and only then.
```

The repository's own Route Handlers are the worked examples of the exception:
`/q/<slug>` and `/s/<slug>` exist because the client is a phone's camera app or
somebody else's browser following a link, there is no UI to render, and what it
needs is an HTTP redirect carrying headers a page cannot set. See
[`case-studies/short-links.md`](case-studies/short-links.md) for every header and
why it is there.

**A page gate is not a header.** Anything that needs words on it — a password
prompt, an explanation, a form — is a page, not a route handler.

**A studio's own runner must not be a privileged client.** Where a tool exposes a
public endpoint, the tool's own UI calls that endpoint, not a Server Action
shortcut past it. Otherwise a request that worked on the page fails from `curl`,
and the studio becomes the one place the endpoint's own rules do not apply. See
[`case-studies/graphql-server.md`](case-studies/graphql-server.md).

---

## The domain layer is not optional

UI must never directly access Prisma or Supabase. Always go through the domain
layer.

```
modules/users/
  domain/
  repository/
  actions/
  validation/
  types/
```

Components call:

```ts
await getUsers();
```

not:

```ts
prisma.user.findMany();
```

### Repository layer

Only repositories may import Prisma or Supabase. Application code never does.

### Business logic

Business rules belong in the domain layer. Components never contain business
logic.

A useful consequence, worth reaching for deliberately: a gate that lives in the
**pure engine** rather than the repository is one branch covered by the same unit
tests as every other path, instead of something only reachable with a database.
See [`patterns/growth-ceilings.md`](patterns/growth-ceilings.md).

### Supabase

Supabase is for Authentication, Storage and Realtime only. Database access always
goes through Prisma.

`proxy.ts` runs on everything, including routes that must not pay for it. The
matcher catches every non-static path, so a public API route would get a Supabase
session refresh and a `Set-Cookie` for this site's auth written onto its
response. The prefix check has to live _inside_ the proxy function, because
`config.matcher` values must be build-time constants. See
[`case-studies/mock-server.md`](case-studies/mock-server.md).

---

## Injection at the domain boundary

`domain/` is framework-free and reachable from the client bundle, which makes two
things injected rather than imported:

- **Non-determinism.** `clock` and `random` (`tools/domain/random.ts`) arrive as
  parameters, so tests are reproducible. Seed a generator rather than reaching
  for `Math.random` when reproducibility is the point — but keep the seeded
  generator away from anything that must be unguessable, which still comes from
  `crypto.getRandomValues`. See
  [`patterns/tree-editors.md`](patterns/tree-editors.md).
- **Large, server-only dependencies.** `@faker-js/faker` is ~3 MB, so the
  registry holds ids and metadata while the call itself arrives on
  `ExecutionContext` from a `server-only` module.

Anything that touches the DOM or clipboard takes its dependency as a parameter
with a browser default (`copyText(text, clipboard = …)`), so tests pass a fake
instead of needing a DOM. See [`testing.md`](testing.md).

**A capability that is absent cannot be forgotten.** Where a code path must be
unavailable in some contexts, make it an optional dependency the context is built
without — not a boolean somebody has to remember to check. See
[`patterns/outbound-requests.md`](patterns/outbound-requests.md).

---

## Validation

Use Zod for:

- forms
- route params
- search params
- APIs
- Server Actions

Never trust client input.

Two conventions:

- **Search params use `.catch(undefined)` per field**, so a malformed link
  degrades to defaults instead of a 500.
- **Bound the size of anything passed through as `z.unknown()`.**
  `serverActions.bodySizeLimit` is 11 MB app-wide because one tool forwards
  photographs, so every action inherits that ceiling. `z.unknown()` is the right
  call about _shape_ and is silently also a decision about _size_. Use
  `tools/domain/payload-size.ts` — see
  [`patterns/input-limits.md`](patterns/input-limits.md) for how it is built and
  why `JSON.stringify(value).length > limit` is the wrong guard.
