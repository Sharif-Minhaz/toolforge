# Testing

Every tool feature requires unit tests.

Run with `bun test`. Tests live in `src/modules/<feature>/tests/*.test.ts` and
import through the `@/` alias.

Focus on correctness, edge cases and regressions. Do not chase coverage
percentages.

---

## Test the domain layer, not the markup

- generation and transformation logic (per version, per mode)
- boundary validation (min, max, off-by-one, `NaN`, fractional, negative)
- serialisation for every export format, including the empty case
- typed-result helpers (`copyText`, `saveFile`) via injected fakes

Two conventions worth keeping:

- **Prefer a typed `for…of` loop over `test.each`.** Bun's `test.each` types the
  callback parameter as `unknown`, which forces casts.
- **Anything that touches the DOM or clipboard takes its dependency as a
  parameter with a browser default** (`copyText(text, clipboard = …)`), so tests
  pass a fake instead of needing a DOM.

Build the domain layer first and get `bun test` green **before** writing any UI —
see [`workflow/adding-a-tool.md`](workflow/adding-a-tool.md).

---

## Verifying against something that is not you

This is the most expensive lesson in the repository and it has been re-learned
five times. It applies whenever a tool emits a format, or reproduces a behaviour,
that something other than this codebase has to read.

**A generator that also owns its own tests proves nothing.** A wrong entry in a
table, or an off-by-one in an interleaver, still produces output that looks
exactly like the real thing — self-consistent, plausible, and unreadable by
anything else. The QR encoder's placement loop skipped the timing column by one
column too few, and every structural assertion written about it passed.

The shape to reach for: **encode, decode with a different implementation, assert
you got back what you put in.**

### Picking the independent implementation

It does not have to be a big lift. In rough order of cheapness:

| Kind | Example | Where |
| --- | --- | --- |
| A program already on the machine | `file(1)`, ImageMagick's `identify`, Pillow, `patch(1)` | [image-codecs](case-studies/image-codecs.md), [diff](case-studies/diff.md) |
| A library the tool already depends on for the other direction | `jsqr` decodes what the QR encoder wrote | [qr](case-studies/qr.md) |
| The reference parser for a printer you hand-wrote | `graphql-js` parses the SDL `renderSdl` printed | [graphql-server](case-studies/graphql-server.md) |
| The library you are cloning, driven without its server | `json-server`'s own `Service` class in a scratch directory | [json-server](case-studies/json-server.md) |
| The reference implementation of the format | `blurhash@2`, byte-for-byte | [blurhash](case-studies/blurhash.md) |
| A throwaway script that calls the real package | every `@faker-js/faker` id in the registry | [tree-editors](patterns/tree-editors.md) |

A scratch dependency installed in a temporary directory, used once and deleted,
is not a dependency of this project. What stays in the repository is the
_results_, pinned as a test, with each one saying which behaviour it caught.

### The four rules the five instances left behind

**Test the whole domain, not a sample.** The QR bug broke only three of the 160
version/level pairs — the ones with a single error-correction block and the least
parity. A handful of hand-picked payloads would have shipped it. One test per
version and error-correction level exercises every row of the block tables and
every alignment-pattern layout, rather than assuming them.

**When output decodes on some inputs and not others, suspect placement before
arithmetic.** Higher error-correction levels were masking a systematic
corruption; the levels that failed were simply the ones with no redundancy left
to spend on it.

**When an independent reader disagrees with you, find out what it actually said
before changing the code.** The ICO writer cost two rounds of chasing assertions
that were wrong while the file was right: `identify` labels an ICO frame by the
codec inside it (`PNG 16x16`), not by the container; `file(1)` describes only the
first couple of directory entries and stops; and Pillow reports a PNG that OxiPNG
losslessly reduced from RGBA to RGB-plus-`tRNS` as mode `RGB`, which looks
exactly like lost transparency until you convert and read the alpha extrema.
Three "failures", zero defects.

**The reference implementation is also code, and some of what it does is a bug.**
Decide per behaviour whether to match it, and write down which way and why — the
decision tree is in
[`engineering-principles.md`](engineering-principles.md#cloning-behaviour-match-diverge-or-refuse),
worked both ways in [blurhash](case-studies/blurhash.md) and
[json-server](case-studies/json-server.md).

### Round-trip at the model, not at the text

Where two spellings mean the same thing, byte equality is the wrong invariant.
For a converter, `parse(emit(parse(x)))` equalling `parse(x)` is the right one.
That test found a real defect in the cURL module that nothing else would have —
see [`case-studies/curl.md`](case-studies/curl.md).

### A format's idea of a line may differ from yours by exactly one

When you emit a format, write down which model each side of the boundary uses
_before_ writing the converter. See [`case-studies/diff.md`](case-studies/diff.md)
for the case where it cost a patch nothing could read.

---

## A byte-exact codec can still be a bad tool

A cross-check proves you implemented the format; it says nothing about whether
the tool built on it is any good.

**Render the output and look at it.** `Read` displays an image, so a throwaway
script that writes PNGs is a real review: encode the picture, decode it, write
both, and put them side by side. A minimal PNG writer is forty lines over
`node:zlib`; Pillow and ImageMagick are already on the machine for reading real
photographs in; and none of it belongs in the repository afterwards.

**Measure against the right reference, or the number lies.** A metric that cannot
separate the two states you are choosing between is worse than no metric, because
it reads as evidence.

The full story, and the three defects it found:
[`case-studies/blurhash.md`](case-studies/blurhash.md).

---

## What `bun test` cannot reach

The image codecs need `ImageData` and fetch their binary by URL, so `bun test`
cannot run them at all. Test the pure layer around them and verify the codecs in
a throwaway Node script — see
[`case-studies/image-codecs.md`](case-studies/image-codecs.md).

The same split applies anywhere a wasm module, a canvas, or a network dependency
sits under otherwise-pure logic: make the arithmetic pure and tested, and verify
the glue out of band.

---

## Verification commands and permissions

What to run before calling a change done, what needs the maintainer's permission,
and the `tsc` filtering trap that once shipped a broken build:
[`workflow/verification.md`](workflow/verification.md).
