# Domain Inspector

`src/modules/domain-inspector/` — the address guard, the DoH transport and the
signature table.

The SSRF doctrine it established is in
[`../patterns/outbound-requests.md`](../patterns/outbound-requests.md); the
propagation map is in [`../patterns/maps.md`](../patterns/maps.md). This file is
what is specific to the module.

---

## It is a different problem from calling a worker we own

There, the destination is ours. Here it is a stranger's, and the tool is an SSRF
surface before it is a feature. Everything in
[`../patterns/outbound-requests.md`](../patterns/outbound-requests.md#part-one-a-host-the-reader-named)
applies: resolve first and connect to the address you checked, guard every
redirect hop, and treat the private-range list as longer than the three everybody
remembers.

Two implementation details worth keeping in view here:

- `tls.ts` connects to `host: address, servername: hostname`.
- `http-probe.ts` pins the same address through the `lookup` option, and is
  `node:https` by hand because **`fetch` cannot be told which address to use**.
- The body cap is 512 KB — every signature worth having and none of the bandwidth
  this server would otherwise spend on a stranger's behalf.

---

## Say the tool is not private, in the tool

Everything else on this site runs in the browser and the site says so on its front
page. One that cannot must carry that in its **own copy** — what is sent, to whom,
and what the inspected host will see in its log — rather than leaving the
site-wide promise to cover it.

---

## A signature table is code, not a dependency

Detecting what a site runs is a list of patterns and something to run them over
headers, cookies, markup and delegation. Every published Wappalyzer-shaped package
is either unmaintained — `wappalyzer-core` says so in its own npm description — or
arrives with a headless DOM and an HTTP client attached.

`domain/fingerprints.ts` is **data in `domain/`**, matched by a pure function, and
unit-tested against fixtures. Two rules keep it honest:

- **No `g` flag on any pattern.** A `RegExp` with `lastIndex` is module-level
  mutable state shared by every request the server handles.
- **Every entry carries a licence**, SPDX or the literal `Proprietary`, because
  "what is this built on" and "may I build on it" are the same question asked
  twice.

This is the opposite call from the BSON module's, and the line between them is
worth stating: **implement it yourself when the output is only ever read here;
depend on the reference implementation when somebody else has to read it.** A
wrong pattern in a fingerprint table is one wrong row on one page. See
[`bson.md`](bson.md).

---

## Scrolling to a scan that has not answered yet

This tool and the Port Scanner both scroll when the scan _starts_, and that bought
a bug. The fix, and the rule it left behind, are in
[`../design-system.md`](../design-system.md#never-scroll-to-a-destination-that-can-turn-out-empty).

`checkHostSyntax` lives apart from `hostname.ts` precisely so the island can run it
without pulling `tldts` and its suffix list into the bundle.
