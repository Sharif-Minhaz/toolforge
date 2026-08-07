# cURL Converter

`src/modules/curl/`. Reads one notation and writes another, in both directions.

The general shape — parse into a model, write the model out — is in
[`../patterns/format-conversion.md`](../patterns/format-conversion.md). This file
is what is specific to curl.

---

## The one thing a tolerant parser may not guess is arity

curl has around two hundred flags. Guessing that an unknown one takes a value eats
the URL; guessing it takes none promotes its value to one.

`flags.ts` records arity **even for flags nothing acts on**, precisely so that
being _ignored_ stays survivable and being _mis-split_ stays impossible.

The fallback for a flag outside the table consumes the next token **only when it
can be neither a flag nor an address.**

---

## Detect the dialect before tokenising, never during

"Copy as cURL" is three languages. `{"a":1}` arrives as:

| Shell | Spelling |
| --- | --- |
| bash | `'{"a":1}'` |
| cmd | `^"{\^"a\^":1}^"` |
| PowerShell | ``"{`"a`":1}"`` |

One forgiving pass that tries to satisfy all three reads two of them wrong and
produces a request nobody made.

**cmd is two layers in a fixed order** — the shell resolves `^`, then curl's own C
runtime resolves `\"` — and conflating them is what makes hand-rolled readers get
`^"` wrong.

---

## A quoter can be checked by something that is not you, cheaply

Emit the command, define:

```sh
curl() { for a in "$@"; do printf '%s\0' "$a"; done; }
```

…and pipe the whole thing to `/bin/sh`. Real word-splitting, no dependency, and it
covers `bash` and `dash` in the same script.

**Say in the handoff which dialects that could not reach** — cmd and PowerShell
have no interpreter on Linux, so their guarantee is only the round trip through
this repo's own reader.

---

## The empty header

Round-tripping at the model — `parse(emit(parse(x))) === parse(x)` — found a real
defect nothing else would have:

An empty header emitted as `Name: ` **reparses as a removal**, because `Name:`
with nothing after it is how curl is told to drop a header it would otherwise add.

The spelling that means "send this, empty" is `Name;`.

---

## Defaults that differ

| Behaviour | curl | `fetch` |
| --- | --- | --- |
| Redirects | not followed without `-L` | followed unless told not to |
| Body content type with `-d` | `application/x-www-form-urlencoded` | `text/plain` for any string body, `JSON.stringify` output included |

Neither is visible until a server refuses the request. Both are written out
explicitly rather than left implicit — carrying the _default_ across, not the
silence.

---

## `redirect: "manual"`

The honest translation of "no `-L`" is `redirect: "manual"`, and **on Node that is
exactly right.**

In a browser the same line makes the response _opaque_ — status 0, headers gone,
body unreadable — so a snippet that cannot read its own reply is the worse answer.
There it is left out and the difference becomes a note.

**Decide per runtime, and write down which way and why.**

---

## Naming what was dropped

curl is a superset of every target, so a conversion always loses something, and
each language loses a different third. `notes.ts` takes a capability record per
target and turns everything unsupported into a typed note the UI lists under the
output.

A `fetch` that quietly lost `--insecure` looks correct right up to the first
self-signed certificate. The same mechanism carries the _adapted_ cases, which
matter just as much: `-m 15` becoming `AbortSignal.timeout(15000)` is not a loss,
but it is not recognisable either.

---

## The JS value reader

`js-value.ts` reads the slice of JavaScript a `fetch` init is written in and
returns anything else as `raw` — the source text, untouched. A real parser is a
dependency and a far larger surface for the sake of expressions almost nobody
writes.

Two traps it cost:

- **`await` has to be skipped as a prefix**, or `const r = await fetch(…)` comes
  back as one opaque expression with the call buried inside it.
- **A call inside a declaration is still a call**, so the scanner has to walk the
  value tree rather than only the statement list.

---

## Highlighting

The code editor started in this module and moved to `tools/` whole the moment the
BSON converter needed one. The tokenizer for it is a **different** tokenizer from
the one that reads the command — `highlight.ts`, not `tokenize.ts` — because the
two want opposite things.

See [`../patterns/syntax-highlighting.md`](../patterns/syntax-highlighting.md).
