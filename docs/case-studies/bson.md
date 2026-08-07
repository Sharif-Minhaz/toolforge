# BSON Converter — When to Take a Format on Trust

`src/modules/bson/` reads and writes three notations of one data model, and it
does not implement any of them.

---

## The call, and why it is the opposite of the Domain Inspector's

**Implement it yourself when the output is only ever read here; depend on the
reference implementation when somebody else has to read it.**

A wrong pattern in a fingerprint table is one wrong row on one page — see
[`domain-inspector.md`](domain-inspector.md), where the table is hand-written on
purpose. A hand-rolled Decimal128, or a re-reading of the TOON spec, produces
bytes that only this site can read, which is precisely what a converter is not
for.

Both dependencies were checked before being taken: **zero transitive dependencies
each, and both maintained by the format's own owner.**

---

## What is still ours

- **N formats cost N readers and N writers, never N² translators.** `convert.ts`
  parses whichever notation arrived into one plain `JsonValue` and writes that
  value out in whichever was asked for. Six conversions, four codecs, and
  BSON → TOON cannot develop its own opinion about what a date is because no code
  path connects the two directly. See
  [`../patterns/format-conversion.md`](../patterns/format-conversion.md).

- **Where the model runs out, name the bridge.** BSON has twenty types and JSON
  has six, so the hub value is _Extended JSON_ — MongoDB's own spelling of those
  types as ordinary JSON objects. That is what makes TOON carry an ObjectId for
  free: TOON encodes the JSON data model, and Extended JSON is inside it.

## A library's defaults are not your guarantee

`deserialize` promotes a `Double` to a JavaScript number and `EJSON.deserialize`
promotes a `$numberLong` back to one, so the obvious four-line round trip **loses
two types and silently rewrites the third.**

`promoteValues: false` on the way out and `relaxed: false` on the way in are what
make canonical mode byte-exact. Both constants carry the reason at their
definition, because both look like paranoia and neither is.

---

## Two rules that generalise past this module

### Earn a lossiness warning per document, or do not show one

Relaxed Extended JSON loses a `Double` holding a whole number and any int64 past
±2⁵³ — and preserves everything else, which is most real documents. A standing
"this may be lossy" banner is therefore wrong most of the time, and **a warning
that is usually wrong is one people stop reading.**

`readBson` instead writes the relaxed result back to BSON and compares bytes with
what arrived, so the note appears only when it is true. One extra serialize is a
cheap price for a warning that means something.

### An engine's error message is host-derived

`JSON.parse` says `Unexpected token '}' … at position 7` on V8 and
`JSON Parse error: Unexpected token '}'` on JavaScriptCore. Putting either in the
output makes the server pass and the hydration pass disagree — the same trap as
`Intl.supportedValuesOf`, arriving from a direction that looks nothing like it.

So `json-codec.ts` returns a typed `invalid_json` and nothing else, and the copy
points at the JSON Formatter, which owns a hand-written parser and can name the
line.

`ToonDecodeError` is safe to render for the mirror reason: it comes from a pinned
dependency, not from the host.

See
[`../hydration-and-platform-pitfalls.md`](../hydration-and-platform-pitfalls.md).
