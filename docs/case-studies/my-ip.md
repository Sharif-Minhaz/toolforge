# What Is My IP

Three things readers ask about this tool. One was a defect; the other two are
limits of the platform, and they are easy to "fix" wrongly.

---

## "Not found" was shown when the lookup had failed

The Network panel's reverse-DNS row alternated between `host219.maishabd.net`
and "Not found" for the same address. Both answers came from the same code
path, and the record never changed.

**Cause.** Many reverse zones are served by one small name server at the ISP.
The one that showed this, `ns1.maishabd.net`, took 1–8 s to answer Cloudflare's
resolver, sometimes did not answer at all, and tagged its answers
`EDE(18) Prohibited` / `EDE(23) Network Error`. Public resolvers cache per node,
and the function runs in whichever Vercel region is nearest, so a cold cache is
common. When the lookup ran past `DNS_TIMEOUT_MS`, `lookupReverse` returned
`null`, which was the same value it returned for an address with no PTR record.
The panel rendered `null` as "Not found".

**Fix.** The reverse lookup has three outcomes: `readReverseAnswer` in
`tools/domain/dns.ts` returns `found`, `absent` or `failed`. `HostRouting`
carries `reverseFailed` alongside `reverse`. A failed lookup is asked once more
of `REVERSE_FALLBACK_RESOLVER` (a different provider, so a separate cache and a
separate route) with `REVERSE_RETRY_TIMEOUT_MS`. If that fails too, the row says
the lookup failed. This page, the Domain Inspector's hosting panel and the
IP & Route Globe all read the same `describeRouting`.

While fixing this, two related defects in the same path were also fixed:

- `queryDns` reported SERVFAIL and REFUSED as `no_records`, which the panels
  word as "nothing is published here". They are now `server_failure`
  (`dohStatusFailure`). Propagation counts them as a resolver that failed, not
  one that answered "no records".
- The PTR was read from `answers[0]`. A classless (RFC 2317) delegation answers
  with a CNAME first, so that took the CNAME target as the name. The reader now
  picks the PTR-typed answer.

Only reverse names retry against another resolver. Every other lookup is a
claim about the resolver the reader chose.

---

## The client port is not shown, because the server never sees it

ifconfig.me shows `port: 45794`. This tool cannot, on the current host. The
browser's TCP connection ends at Vercel's edge, and the function receives a new
request from Vercel's proxy. Vercel forwards the client address
(`x-forwarded-for`, `x-real-ip`, `x-vercel-forwarded-for`) and geo headers, but
no header carries the source port. ifconfig.me can show it because it sits
behind Google's load balancer (`via: 1.1 google`), which can add the client
port as a request header.

Do not read `x-forwarded-port`. That is the port the edge listened on (443), not
the reader's. To show a real client port, the request has to pass through
something that can forward it: Cloudflare in front with a Transform Rule setting
a header from `cf.edge.client_port`, trusted only when `cf-connecting-ip` is
also present, or a host that terminates the socket itself.

---

## Different sites show different addresses, and none of them is wrong

A reader saw `103.86.199.218` on ifconfig.me, `.199.219` here and `.198.210` on
whatismyipaddress.com within minutes. All three addresses belong to the same
ISP's NAT pool (AS18109). With carrier-grade NAT or several uplinks, each new
outbound connection can leave from a different pool address, so each site
correctly reports the address its own connection arrived from. Do not "fix"
this by asking a third-party IP API; that would replace a fact about this
request with a fact about someone else's.
