# Converting Between Notations That Describe One Thing

The shape to copy whenever a tool reads one notation and writes another — and
especially when it does both directions. Anchored in `src/modules/curl/` (two
notations) and `src/modules/bson/` (four).

---

## N formats cost N readers and N writers, never N² translators

**Never rewrite one syntax into the other.** Parse whichever notation arrived into
one model, and write that model out in whichever was asked for.

In the cURL module a command is parsed into an `HttpRequest` and the request is
written back out; `curl → fetch` and `fetch → curl` share that model and touch
nothing else of each other's. In the BSON module `convert.ts` parses into one
plain `JsonValue` and writes that out — six conversions over four codecs.

Two direct translators is two places for "what does `-L` mean" to be answered
differently, and the disagreement only shows up on the input nobody tested. It
also means BSON → TOON cannot develop its own opinion about what a date is,
because no code path connects the two directly.

It buys a free feature, too: the cURL module's Request tab is not a second parse,
it is the object both sides were built from.

## Where the model runs out, name the bridge

BSON has twenty types and JSON has six, so the hub value is _Extended JSON_ —
MongoDB's own spelling of those types as ordinary JSON objects. That is what makes
TOON carry an ObjectId for free: TOON encodes the JSON data model, and Extended
JSON is inside it.

Pick the bridge deliberately and write down what it is. A hub that cannot express
one input's types silently becomes a lossy conversion nobody declared.

---

## Round-trip at the model, not at the text

Where two spellings mean the same thing, byte equality is the wrong invariant.
`-d` and `--data-raw` say the same thing, so what must hold is:

```
parse(emit(parse(x))) === parse(x)
```

That test found a real defect nothing else would have — see
[`../case-studies/curl.md`](../case-studies/curl.md#the-empty-header).

---

## Defaults that differ are the bugs nobody sees

Two runtimes that both "send a POST" rarely agree on what they send. curl does
not follow a redirect without `-L`; `fetch` follows unless told not to. curl sends
`application/x-www-form-urlencoded` with `-d`; `fetch` sends `text/plain` for any
string body, `JSON.stringify` output included.

Neither is visible until a server refuses the request. Write both out explicitly
rather than leaving them implicit — **carry the default across, not the silence.**

---

## Naming what was dropped is half the tool

Every conversion loses something, and each target loses a different third. Take a
capability record per target and turn everything unsupported into a typed note the
UI lists under the output (`curl/domain/notes.ts`).

A `fetch` that quietly lost `--insecure` looks correct right up to the first
self-signed certificate. Carry the _adapted_ cases the same way: `-m 15` becoming
`AbortSignal.timeout(15000)` is not a loss, but it is not recognisable either.

**Where being faithful would produce a worse artefact, say so instead.** Decide
per runtime, and write down which way and why — see
[`../case-studies/curl.md`](../case-studies/curl.md#redirect-manual).

---

## Implement, or depend?

**Implement it yourself when the output is only ever read here; depend on the
reference implementation when somebody else has to read it.**

A wrong pattern in a fingerprint table is one wrong row on one page. A hand-rolled
Decimal128 or a re-reading of the TOON spec produces bytes that only this site can
read, which is precisely what a converter is not for.

Check the dependency before taking it — transitive count, and who maintains it.
See [`../engineering-principles.md`](../engineering-principles.md#depend-or-implement).

**A library's defaults are not your guarantee.** See
[`../case-studies/bson.md`](../case-studies/bson.md#a-librarys-defaults-are-not-your-guarantee).

---

## A hand-rolled reader degrades; it does not fail

`curl/domain/js-value.ts` reads the slice of JavaScript a `fetch` init is written
in and returns anything else as `raw` — the source text, untouched. A real parser
is a dependency and a far larger surface for the sake of expressions almost
nobody writes.

Two traps it cost are recorded in
[`../case-studies/curl.md`](../case-studies/curl.md#the-js-value-reader).

---

## Related

- [`syntax-highlighting.md`](syntax-highlighting.md) — the *other* tokenizer,
  and why a converter needs two.
- [`../testing.md`](../testing.md#verifying-against-something-that-is-not-you) —
  how to prove the writer is readable by somebody else.
