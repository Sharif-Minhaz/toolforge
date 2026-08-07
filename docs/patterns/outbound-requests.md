# Making the Server Reach the Network

Two different problems that look alike. Keep them apart:

1. **A host the reader named.** The destination is a stranger's. The tool is an
   SSRF surface before it is a feature. `src/modules/domain-inspector/`,
   `src/modules/port-scanner/`, and the Mock Server's outbound node.
2. **A service we own.** The destination is in the environment. The problems are
   about attribution and payload size. Every tool that fronts a Workers AI model.

---

## Part one: a host the reader named

## Resolve first, then connect to the address you checked

Checking the _name_ proves nothing — `metadata.attacker.example` is a perfectly
public name that resolves to `169.254.169.254`. And checking the name's addresses
and then connecting **by name** re-resolves it, so a record with a one-second TTL
can answer publicly for the check and privately for the connection.

`tools/repository/address-guard.ts` returns a **list of addresses** rather than a
boolean for exactly that reason. `tls.ts` connects to
`host: address, servername: hostname`, and `http-probe.ts` pins the same address
through the `lookup` option.

`fetch` cannot be told which address to use, which is why the page probe is
`node:https` by hand.

## Every redirect hop is a new host and a new decision

Following redirects automatically hands the decision to whoever wrote the
`Location` header. Follow them yourself — `domain-inspector`'s `http-probe.ts`
and the mock studio's `guardedFetch` both do, because a public URL that 302s to
`169.254.169.254` defeats a check done once. Guard each hop, cap the chain, and
cap the body — 512 KB of a page is every signature worth having and none of
the bandwidth this server would otherwise spend on a stranger's behalf.

**Only the first hop carries the body.** A 301 on a POST is followed as a GET by
every real client, and re-sending a body to a host the author did not name is
precisely what should not happen.

**Cap a response while it streams.** Reading it all and measuring afterwards is
how a four-gigabyte reply kills the process.

## The range list is longer than the three everybody remembers

Loopback and RFC 1918 are the obvious ones. What actually gets used is
`169.254.169.254`, and what gets missed is the IPv4 address hiding inside an IPv6
literal — a `::ffff:127.0.0.1`, a NAT64 `64:ff9b::`, a 6to4 `2002:`.

`tools/domain/ip.ts` unpacks all three and classifies the embedded address, and it
is **strict where the boundary is fuzzy**: an octal-ambiguous `010.0.0.1` is
rejected rather than normalised, because an address two resolvers disagree about
is precisely what a filter exists to catch.

## Close the surface by construction, not by a flag

`ExecutionContext.outbound` is optional, and a context built without it _cannot_
make a request — the node returns `unsupported_node`. The serve path wires it in
only when the stored graph actually mentions the node.

There is no boolean anybody can forget to check, because the capability is absent
rather than disabled.

**Build the guard before the feature.** The Mock Server's outbound node was built
last on purpose: when a feature turns user configuration into an outbound request,
ship everything else first and let the guard stack be the gate on the feature
rather than a follow-up ticket.

## Order the gates by cost

URL shape is a regular expression, so it runs first and a typo costs nothing. The
per-execution counter is a local integer. The quota is a database write and runs
last, because it is the only one that bounds _volume_ — everything above it
refuses one bad call and this refuses the thousandth good one. It fails closed,
exactly like the Port Scanner's. See [`../security.md`](../security.md).

## Decide what comes back, not just what goes out

Forwarding an upstream's `set-cookie` into a mock's own response would launder
somebody else's session through this origin. **Four headers are carried;
everything else is dropped.**

The outbound direction drops `authorization`, `cookie` and `host` for the mirror
reason, and any header value containing a **newline**, which is request splitting.

## Say the tool is not private, in the tool

Everything else here runs in the browser and the site says so on its front page.
One that cannot must carry that in its own copy — what is sent, to whom, and what
the inspected host will see in its log — rather than leaving the site-wide promise
to cover it. See
[`../engineering-principles.md`](../engineering-principles.md#say-what-you-cannot-keep).

---

## Part two: a service we own

Every tool that fronts a Workers AI model reads its endpoint and bearer key in
`repository/`, on the server, and never from the browser. Two consequences fall
out of that, both found building the Watermark Remover.

## A per-IP limit upstream becomes a per-deployment limit here

The worker sees this server's address in `CF-Connecting-IP`, not the visitor's, so
a "five uploads a minute per IP" rule is five a minute for the whole site. Setting
`X-Forwarded-For` does not help — Cloudflare's own header wins.

Either have the worker prefer a forwarded-IP header from a trusted caller, or say
plainly in the copy that the limit is shared. **Never describe an upstream
per-connection limit as if it were per visitor.**

## Send the smallest thing that answers the question

The Watermark Remover crops the square around the mask in the browser, sends that
at the model's own 512 px, and composites the reply back onto the full-resolution
original through the same strokes. The upload is smaller, the model works at
near-native detail, and every pixel the reader did not mark is still theirs.

Reach for the same shape before uploading a whole file: the browser has a canvas,
and `domain/` may hold that glue as long as the arithmetic around it stays pure
and tested. See
[`../case-studies/watermark-remover.md`](../case-studies/watermark-remover.md).

---

## Related

- [`../security.md`](../security.md) — quotas, fail-closed gates, gate ordering.
- [`../case-studies/domain-inspector.md`](../case-studies/domain-inspector.md)
- [`../case-studies/port-scanner.md`](../case-studies/port-scanner.md)
- [`../case-studies/mock-server.md`](../case-studies/mock-server.md)
