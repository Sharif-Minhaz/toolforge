# IP & Route Globe

What the tool cost, and the four decisions that are cheap to get wrong the
second time.

---

## The tool will not run a traceroute, and says so on the page

The obvious version of this tool traces the route itself. It cannot, for two
reasons, and both are worth stating before somebody tries again:

- **There is no traceroute in a request handler.** Tracing a path needs raw
  sockets to set the TTL and read the ICMP replies, which Node does not offer
  without a native module and a privileged process.
- **More importantly, it should not.** A page that traced on demand would send
  packets to every machine along a path a stranger named, from this server's
  address, with no proof of anything. That is the Port Scanner's abuse surface
  with none of the Port Scanner's gates, and it is a service this site would not
  ship.

So the input is _somebody else's_ trace, pasted. That moves the whole risk
profile: the tool reads three public registries and never touches a host on the
map, which is the reason it needs no Turnstile — see below.

The article says this in the first section rather than in the FAQ, because "why
will it not just trace it for me" is the first question a reader has.

---

## Country centroids, and the refusal to guess a city

Every dot is a country centroid. The coordinates come from
`tools/domain/countries.ts`, keyed on the allocation country that RDAP or Team
Cymru reports for the address block.

The alternative — a geo-IP database — was rejected for the reason
`countries.ts` already had written down before this tool existed: a registry
knows which country a block was assigned to, never which building it is plugged
into, and a street-level pin over country-level data promises a precision
nothing here has. Geo-IP is also routinely wrong by a continent for anycast and
carrier-grade NAT addresses, and its default-centroid failure mode has sent
police to real houses.

Three consequences fall out of that choice, and all three are load-bearing:

1. **Hops share coordinates.** A route crossing one country five times is five
   hops at one point. Drawn ungrouped they stack into a single dot that merely
   looks bolder, which reads as five distinct places. Hence `groupByCountry`,
   defaulting on, collapsing them to one dot drawn larger — and the table
   listing all five regardless.
2. **`no_country` is a status, not a failure.** A registry that answered without
   naming a country leaves a hop that is real, named, and has nowhere to be
   drawn. Collapsing that into "lookup failed" would lose the network and
   operator that _were_ found.
3. **The MCP adapter has to say so in words.** A model handed
   `[51.16, 10.45]` with no context will report it as a location. The tool
   description and a `coordinates` field in every reply both state that these are
   allocation centroids, because saying it once here is cheaper than correcting
   it downstream forever.

---

## One parser, three dialects — not a format detector

`domain/parse.ts` reads GNU/BSD `traceroute`, Windows `tracert` and
`mtr --report` with a single line-oriented pass. The tempting design is to sniff
the format from the header and then parse accordingly; it was not built that way
because a detector has to be right about the whole document before it reads any
of it, and it gets the mixed and partial pastes people actually produce wrong.

Three things the dialects disagree about, each of which cost a bug:

- **Where the hostname sits.** GNU leads with `name (addr)`; Windows _trails_
  with `12 ms  name [addr]`. The first implementation took the first token of the
  line, which named every Windows hop `12` — a syntactically valid hostname, so
  nothing complained. The fix is subtraction: strip bracketed addresses, `N ms`
  timings, mtr's percentage columns and the asterisks, then take the first
  remaining token **that contains a letter**. That last test is what separates
  `be-1.cr1.example.net` from Windows' leading `12` and mtr's `Snt` count.
- **How the timing is written.** Both traceroutes suffix `ms`; mtr prints bare
  numbers in fixed columns, where the comparable figure is `Last` — the third
  after `Loss%` — not `Avg` and not `Snt`. This is the one place a shape test is
  unavoidable, and the `%` column is what triggers it.
- **`<1 ms`.** Windows is saying it could not measure below a millisecond. It is
  read as `1`, not `0.5`: inventing a fraction claims a precision the tool did
  not report.

**Unanswered hops are kept as gaps.** Hop 7 following hop 5 with nothing between
them would misreport the length of the path, so a `* * *`, `???` or
"Request timed out" line becomes a hop with no reply rather than a missing row.

**`unsupported_trace_format` had to be made reachable.** The first version
returned it when numbered lines were found but no hops were built — a state the
parser could not actually reach, since a numbered line always produced _some_
hop. It now means something checkable: every hop parsed has no address, no name
and no timeout marker, so the dialect is one this parser does not speak. A
refusal reason that cannot fire is worse than no reason at all, because it reads
like coverage.

---

## A quota, not a Turnstile — and which way it fails

The Port Scanner and the Domain Inspector make this server touch a machine a
stranger named, and a human proof is what stands between that and a free
anonymous scanner. This tool touches nothing: every request goes to a public DoH
resolver, to Team Cymru's TXT zones, or to the RDAP bootstrap. All three are
readable by anybody without a token, all three are at fixed addresses, and none
of them is the host being asked about.

What is genuinely at risk is throughput against upstreams nobody here operates,
and a quota is the gate shaped like that — the same argument the Subdomain
Lookup makes, and this tool reuses its exact shape: two counters in
`service_quota` under the `ip-globe:route` namespace, 15 routes an hour per
visitor and 60 for the whole deployment.

**The second counter is the load-bearing one.** One route is up to forty hops,
and every located hop costs a reverse lookup, two Cymru queries and an RDAP
request. All three services meter by address, and the address they see is this
deployment's. Without the site-wide ceiling, one caller in a loop spends the hour
for everybody and quite possibly gets this server blocked by three registries at
once.

**It fails closed.** No database, no salt, a thrown transaction — the route is
refused. Every other degradation on this site falls toward doing the work; this
one falls the other way, for the reason above.

### The orchestration is in `repository/`, not in the action

`repository/route.ts` does parse → spend → look up, and both the Server Action
and the MCP adapter call it. That is not tidiness: the MCP adapter is a second
entry point, and an entry point that skipped the counter would spend this
deployment's share of three free registries without counting it. The first draft
had the quota in `actions/map-route.ts` and would have shipped exactly that hole.

---

## COBE, and the four things WebGL makes you handle

- **No render loop.** COBE v2 contains no `requestAnimationFrame` at all;
  `update()` draws synchronously. So the spin is our own frame loop — and,
  crucially, a drag or an arrow key has to call `update()` itself, or moving the
  globe with rotation switched off changes `phi` and nothing on screen.
- **Array props rebuild the context.** `markers` and `arcs` are fresh arrays on
  every render of the island, so depending on them directly tore down and rebuilt
  a WebGL context several times a keystroke. The effect depends on a serialised
  key instead, and reads the arrays out of a ref.
- **`createGlobe` does not throw without WebGL.** It returns an object whose
  methods do nothing, so a browser that cannot draw would show an empty square
  and no explanation. Support is probed on a throwaway canvas — asking the real
  one for a context is what binds it — and the failure branch says so in words.
  The table holds everything the globe would have shown, which is what makes that
  degradation honest rather than a dead end.
- **Colours have to be numbers.** COBE takes `[r, g, b]` floats and the design
  tokens are `oklch()`, with no path from a CSS custom property into a WebGL
  uniform. Rather than hard-code a palette that would silently stop matching
  `globals.css`, the tokens are read with `getComputedStyle` and converted by
  assigning them to a Canvas 2D `fillStyle` and reading it back as `#rrggbb` —
  the browser's own colour parser. The arithmetic half lives in `domain/palette.ts`
  and is tested; a non-hex result returns `null` rather than `NaN`, because WebGL
  renders a `NaN` uniform as black without complaining.

---

## What this tool lifted into the shared layer

It needed the Domain Inspector's whole network spine, so that spine moved before
any of this was written — `tools/domain/{dns,rdap,reverse-names,countries,network-constants}.ts`,
`tools/repository/{doh,rdap,host-address}.ts`, `tools/validation/network.ts`,
`tools/types/network.ts`, `resolvePublicAddresses` joining `guardAddresses`, and
`components/use-country-name.ts`.

Three of those were **splits rather than moves**, and that is the part worth
remembering: `dns.ts`, `rdap.ts` and `PanelFailureReason` each mixed generic
transport with Domain-Inspector presentation. What is shared is reading what a
resolver or registry said; what stayed is what one tool's panels render — MX
preferences, SPF policy, a domain's registration record. `PanelFailureReason`
became `DnsFailureReason` plus that tool's own three, which is a widening, so
every existing reason kept its name and its message key.

The lift landed and went green as its own pass, before a line of this tool was
written. A diff that both moves code and adds behaviour is unreviewable, and it
hides regressions in exactly the code that just moved.
