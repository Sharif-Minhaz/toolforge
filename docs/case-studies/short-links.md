# One Short Link Layer, Two Tools

`src/modules/short-links/` owns every re-pointable link on this site: slug and
alias generation, edit tokens, link passwords, schedule windows, the redirect
decision, and the single `short_links` table.

The QR tool's dynamic codes and the URL Shortener are the same row behind the slug
and differ only in which pair of paths a view is built from — `TOOL_PREFIXES[tool]`,
keyed by `SHORT_LINK_TOOLS`.

---

## What that buys, and what to preserve

- **One `decideRedirect`.** Both `/q/[slug]` and `/s/[slug]` are ten lines over
  `resolveShortLink`, so a window or a password cannot behave differently
  depending on which address was shared. A third feature adds a prefix pair, not a
  second route handler with its own idea of what expired means.
- **Read and count are two statements.** A gated link is read twice — once to
  discover it needs a password, once after the visitor types it — and a single
  counting read would score that as two visits. `countVisit` still does its
  `increment` in the database, so concurrent visits cannot lose one.
- **Every refusal keeps its own name.** `missing`, `pending` and `expired` reach
  the tool page as separate states, because "this expired" and "you mistyped it"
  are different things for the reader to do next.

---

## Redirecting, and what a Route Handler is for

`/q/<slug>` and `/s/<slug>` are the **only** Route Handlers in the repository, and
the exception proves the rule: the client is a phone's camera app or somebody
else's browser following a link, there is no UI to render, and what it needs is an
HTTP redirect carrying headers a page cannot set.

They are ten lines each over `resolveShortLink`, and every header is deliberate:

- **`302`, never `301`.** A permanent redirect is cached indefinitely by every
  browser that followed it once, which is the exact opposite of what a
  re-pointable link is for — and it would outlive an expiry window outright.
  `Cache-Control: no-store` for the same reason.
- **`X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`.** The
  destination belongs to whoever created the link. This origin lends it none of
  its ranking, and the destination learns nothing about the visit.
- **Validate the slug before the query and the target before the header.** The
  first keeps a scripted walk of the keyspace away from the database; the second
  is because a stored value becoming a `Location` header is not a place to assume
  anything.
- **A password gate is a page, not a header.** `/unlock/<slug>` renders from the
  slug alone; the destination stays on the server until the action verifies the
  password. Anything that needs words on it does not belong in a route handler.

---

## A user-creatable redirect is an abuse surface before it is a feature

Four things, and without all four the service is a phishing host that happens to
shorten URLs:

1. Creation sits behind Turnstile.
2. Destinations are `http:`/`https:` only.
3. Aliases that read like a lure (`login`, `verify`, `secure`, …) are reserved.
4. A short link may not point at another short link on this host — on either
   prefix.

---

## Related

- [`../patterns/browser-persistence.md`](../patterns/browser-persistence.md) —
  both tools keep each link's edit URL in the browser, which is a credential
  store and has to say so.
- [`../server-and-data.md`](../server-and-data.md#when-a-route-handler-is-justified)
- [`../security.md`](../security.md#user-creatable-redirects)
