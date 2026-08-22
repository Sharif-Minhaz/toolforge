# Subdomain Lookup

`src/modules/subdomain-lookup/` — reading somebody else's free index, and giving
back an answer that can be twenty thousand rows long.

The rate-limiting doctrine it inherits is in [`../security.md`](../security.md);
the reason an upstream's per-IP limit becomes a per-deployment limit is in
[`../patterns/outbound-requests.md`](../patterns/outbound-requests.md#part-two-a-service-we-own).
This file is what is specific to the module.

---

## It is not the SSRF problem the other network tools have

The Domain Inspector and the Port Scanner connect to a host the reader named, so
everything in
[`../patterns/outbound-requests.md`](../patterns/outbound-requests.md#part-one-a-host-the-reader-named)
applies to them: resolve first, connect to the address you checked, guard every
redirect hop.

Here the destination is a constant. What the reader controls is one query
parameter, so the guard is a different shape: `domain/apex.ts` reduces whatever
was typed to an eTLD+1 through the Public Suffix List before anything leaves the
process, and `repository/crt-name.ts` puts it through `URLSearchParams` rather
than concatenating it. Redirects are `redirect: "manual"` — not for safety, since
nothing follows one, but because a redirect from this endpoint means the API
moved, and quietly following it to some other host is not a thing to do with a
reader's query.

**Reading the doctrine as "this is a network tool, so add an address guard" would
have been the wrong lift.** The guard belongs where a stranger picks the
destination.

---

## The limit is somebody else's, and that changes which way it fails

crt.name is free, unauthenticated, and meters a thousand calls per IP per day.
The IP it sees is this deployment's, so that thousand is the whole site's budget
and not each visitor's — the same trap the Watermark Remover's worker set, and
the reason `repository/quota.ts` carries **two** counters rather than one:

- 20 lookups an hour per visitor, so one caller cannot drain the hour.
- 40 an hour for the whole deployment, because 40 × 24 = 960 against an allowance
  of 1,000.

Either one alone is insufficient in a way worth stating: the per-visitor ceiling
alone lets forty callers drain the day, and the deployment ceiling alone lets one
caller drain the hour for everybody.

It **fails closed**, and the failure mode is the argument: an unmetered box here
is a scriptable way to spend a shared allowance, take the tool away from every
other visitor until midnight, and get this server's address blocked on the way.

**The MCP adapter spends the same counter**, which is why the orchestration lives
in `repository/lookup.ts` rather than in the Server Action. A second entry point
that reached the upstream without counting would spend the budget invisibly. It
keys its per-caller counter on the literal `"mcp"` — an MCP call has no address
here, and giving every MCP caller one shared allowance is the conservative
reading, which is the right one against somebody else's free tier.

---

## No Turnstile, and that is not an oversight

The Port Scanner and the Domain Inspector make this server touch a stranger's
machine, and a human proof is what stands between that and a free anonymous
scanner. This tool reads a public index anybody may read without a token, from a
fixed address, and hands back names the caller could have fetched themselves.

A challenge would cost every reader a puzzle to save the one abuser a
rate-limited hour. What is actually at risk is *throughput against a shared
allowance*, and a quota is the gate shaped like that. The same reasoning is
written down for the image tools' URL importer in
`src/modules/tools/actions/import-remote-image.ts`.

---

## Cap a large answer twice, and page the third

"The response can be big" is the tool's central problem, and it has three
distinct answers because it is three distinct problems:

| Where | Cap | What it protects |
| --- | --- | --- |
| `repository/crt-name.ts` | 4 MB, **while the body streams** | The server's memory |
| `domain/parse.ts` | 20,000 records | What crosses the Server Action boundary |
| `domain/list.ts` | 100 rows a page | The reader's browser |

The first is enforced during the stream and cancels the reader at the cut, not
after the whole reply has landed — measuring afterwards is how a reply nobody
predicted takes the process down, and a cap that still downloads everything
before rejecting it saves the memory and none of the bandwidth.

The third is **only a rendering decision**, and keeping that true is what makes
the tool honest at scale: the filter, the ordering, the counts above the table
and every download all work over the whole result. A download that stopped at the
visible page would be the one place this tool quietly lost data.

When the second cap bites, `returned` reports what the index held and `total`
what was kept, so the UI can say *"the index holds 41,203 names and this list is
the first 20,000"* rather than showing a prefix of the truth. **A truncation
nobody is told about is worse than a refusal.** The largest domains are refused
upstream anyway — `google.com` answers `413 apex too large` — which is worth
knowing before deciding the caps are hypothetical.

The MCP adapter has the same problem in a different shape and needs its own
answer: twenty thousand names is a lost context window, not an answer. It takes
`contains` and `limit`, always returns the full counts, and sets `truncated` when
the reply is a prefix, so a caller can narrow rather than guess.

---

## `Date.parse` is strict about every field except the one that matters

The index carries a first-seen date per name, which lands in a CSV somebody keeps.
A wrong date there is a wrong fact, so `parse.ts` refuses anything ambiguous.

Two rules, and the second was found by a test rather than by reading:

- **A timestamp with no zone is recorded as no date at all.** It would be read
  against the server's clock in one place and the reader's in another. There is
  already a rendering for "no date"; there is none for "wrong by six hours".
- **`Date.parse` rolls an impossible day over silently.** A month of 13, an hour
  of 25 and a minute of 61 are all `NaN`, but `2026-02-31T00:00:00Z` becomes the
  3rd of March — on **both** Node and Bun, which agree. So `isRealDay` checks the
  day against the month's real length before the string is trusted.

The fixture in `tests/parse.test.ts` is twelve lines captured verbatim from a real
`curl` against the endpoint, not lines written from memory. The whole risk in that
file is reading somebody else's format wrong, and
[`../testing.md`](../testing.md#verifying-against-something-that-is-not-you) is why
the check has to come from outside.

---

## Widen the input rather than refusing it

The index is keyed by registrable domain and answers `400` to anything else,
naming the apex it wanted. Spending a round trip and a quota unit to be told that
is a poor trade, so `readApexInput` narrows `api.staging.example.co.uk` to
`example.co.uk` here.

Narrowing is right rather than merely convenient because **the wider answer
contains the narrower one** — every name under what was typed is in the result.
The report carries `narrowedFrom` and the UI says what it did, because silently
answering a different question is the failure mode this shape has.

An IP address gets its own refusal (`ip_address`) rather than falling into
`unknown_suffix`: "that is an address, not a domain" is a more useful sentence
than "there is no registry for that".

---

## Say what the index is, in the tool

A name is in this list because something published it once. It may have been
decommissioned years ago; the index never deletes anything. And a name that is
missing is not absent from the internet — a subdomain behind a wildcard
certificate publishes nothing.

Both facts sit in the tool's own copy rather than only in the article, alongside
the disclosure that the domain reaches a third party. A tool that reads as an
inventory of what is live, when it is a history of what was published, is wrong in
a way no amount of correct code fixes.
