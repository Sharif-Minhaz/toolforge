# BlurHash — Byte-Exact, and Still a Bad Tool

`src/modules/blur-placeholder/`. Read before touching the codec, the component
defaults, or the preview.

Two separate lessons live here. The first is about matching a reference
implementation that has bugs. The second is about a codec that was correct while
the tool around it was not.

---

## Part one — the reference implementation is also code, and some of what it does is a bug

`blurhash@2` opens its decoder with `punch = punch | 1` — which reads like a
default and is not one, since it truncates to an integer and sets the low bit, so
2 and 2.5 both become 3. Its encoder takes `Math.max` of the _signed_ AC
coefficients where the C reference takes the largest magnitude.

Matching it blindly ships its defects; ignoring it costs the byte-exact comparison
that makes the test worth running. So decide per behaviour, and write down which
way and why:

- **Match anything that changes the bytes other people read.** The signed maximum
  is matched, because a hash that differs from what `blurha.sh` and every npm
  consumer produce is a worse answer than one that spends a fraction of a
  quantiser step.

    Matching also means matching the **arithmetic**: the encoder walks
    columns-outside-rows because the reference does, and floating-point addition
    is not associative, so the other order lands a hair away and rounds a byte
    over a boundary. `Math.trunc(x + 0.5)` is kept for the same reason — it is
    `Math.round(x)`, and `Math.round(x + 0.5)` is not.

- **Never match a defect in a control the reader turns.** Punch is implemented
  correctly here, and the cross-check simply does not compare at any value where
  the reference mangles it — 1, where the expression is a no-op, still exercises
  the entire basis loop for every pixel. The tool's own tests then pin the
  behaviour the reference cannot: three distinct punches render three distinct
  pictures.

The comment at each of those three lines says which rule it is following. **A
constant that looks wrong and is deliberate needs that**, or the next reader
"fixes" it and the cross-check goes red with no explanation of what it was for.

The general decision tree:
[`../engineering-principles.md`](../engineering-principles.md#cloning-behaviour-match-diverge-or-refuse).
The opposite call, worked: [`json-server.md`](json-server.md).

---

## Part two — a byte-exact codec can still be a bad tool

The encoder was verified against the reference across all 81 detail settings,
character for character, and the first thing a reader said about the page was that
the blur did not look like their picture. **Both were true.** A cross-check proves
you implemented the format; it says nothing about whether the tool built on it is
any good, and no amount of staring at the codec finds a defect that is not in the
codec.

### Render the output and look at it

`Read` displays an image, so a throwaway script that writes PNGs is a real review:
encode the picture, decode it, write both, and put them side by side. That is what
found all three of the problems below, and it took less time than the round of
theorising it replaced.

A minimal PNG writer is forty lines over `node:zlib`, Pillow and ImageMagick are
already on the machine for reading real photographs in, and none of it belongs in
the repository afterwards.

### Measure against the right reference, or the number lies

RMS against the sharp original barely moved between a good blur and a bad one —
the error is dominated by the band limit both share. Against a **Gaussian of the
source**, the same change showed up properly.

A metric that cannot separate the two states you are choosing between is worse
than no metric, because it reads as evidence.

### The three defects, and the rules they leave behind

- **Do not stretch a sampled function; evaluate it.** The preview was the
  32-pixel `blurDataURL` in an `<img>`, blown up twenty times. That is bilinear
  interpolation between 32 samples rather than the curve they came from, and it
  flattened the difference between 4 × 3 and 8 × 6 — so the one control that
  decides whether the blur resembles the picture appeared to do nothing.
  `PREVIEW_EDGE` paints the hash at display size instead. The shipped artefact
  stays small; the thing on screen is the truth about it.
- **A default that ignores the input is a bug with good manners.** A flat 4 × 3
  grid over a 16:9 photograph starves the axis that carries the picture.
  `fitComponents` matches the grid to the aspect ratio on `log(x / y)`, so a
  portrait gets the mirror of its landscape rotation, and a budget picks how much
  to spend. The budget is **28** because that is where three rock formations stop
  merging into one red band — a number read off the output, not chosen for being
  round.
- **A working size chosen for speed is a quality setting in disguise.** The encode
  was downscaling to 128 px, which is defensible, and 256 px costs 31 ms at 9 × 9.
  Measure the thing you are trading against before picking the trade.

**When a reader says the output is not good enough, take it as a claim about the
output. Reach for the renderer before the debugger.**

---

## Related

- [`../testing.md`](../testing.md) — both halves of this, generalised.
- [`image-codecs.md`](image-codecs.md) — the shared image layer this tool decodes
  through.
