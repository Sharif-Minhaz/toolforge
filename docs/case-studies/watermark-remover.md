# Watermark Remover — Two Machines Under One Name

`src/modules/watermark-remover/`. The tool has two tabs that share a heading and
nothing else, and most of what is worth recording here is about the seam between
them.

**Part one** — the picture tab — is about calling a Workers AI model, and applies
equally to every other tool that fronts one (`ai-image-detector`,
`ai-text-detector`, and the image half of `equation`).

**Part two** — the video tab — is about doing the same job with no service at all.

---

## Part one: calling a metered worker

Every one of them reads its endpoint and bearer key in `repository/`, on the
server, and never from the browser. Two consequences fall out of that, both found
here.

---

## A per-IP limit upstream becomes a per-deployment limit here

The worker sees this server's address in `CF-Connecting-IP`, not the visitor's, so
a "five uploads a minute per IP" rule is **five a minute for the whole site.**

Setting `X-Forwarded-For` does not help — Cloudflare's own header wins.

Either have the worker prefer a forwarded-IP header from a trusted caller, or say
plainly in the copy that the limit is shared. **Never describe an upstream
per-connection limit as if it were per visitor.**

## Send the smallest thing that answers the question

The Watermark Remover crops the square around the mask in the browser, sends that
at the model's own 512 px, and composites the reply back onto the full-resolution
original through the same strokes.

The upload is smaller, the model works at near-native detail, and **every pixel
the reader did not mark is still theirs.**

Reach for the same shape before uploading a whole file: the browser has a canvas,
and `domain/` may hold that glue as long as the arithmetic around it stays pure
and tested — `watermark-remover/domain/region.ts` is the geometry, `canvas.ts` the
glue.

---

## The one place a raw colour literal is correct

A canvas paint colour sits over the reader's photograph, not over a themed
surface, so no token applies. **Say so in a comment where you write it.**

---

## Part two: the same job with no service at all

The video tab strips the sparkle Gemini and Veo sign their clips with. It runs
entirely in the browser, through WebCodecs and `mediabunny`, and it is not a
model.

### One tool, two promises — say them both, at the controls

The picture tab uploads a square to a Cloudflare Worker. The video tab uploads
nothing. Rule 32 says a limitation is disclosed above the controls rather than in
the article, and here that rule bites in **both** directions: a reader who has
seen "the square you mark is uploaded" and then drops a clip in deserves to be
told the opposite is now true, not to assume the worse of the two.

So each tab carries its own privacy note, its own rights note, its own failure
vocabulary and its own heading and description — `workbench.imageTitle` and
`workbench.videoTitle`, not one shared `title`. **A tab strip over two panels is
one component; it is not one set of promises.**

The failure reasons are separate lists (`WATERMARK_FAILURE_REASONS` and
`VIDEO_FAILURE_REASONS`) for the same reason. One tab fails at a worker over the
network, the other at the browser's own codecs; a shared union would have been
two vocabularies stapled together where every member is unreachable from one
side.

### Average the frames, and the watermark is the thing left standing

A fixed mark over moving footage is a signal-processing problem, not a vision
problem. Average the corner across two dozen moments spread through the clip and
the footage washes out while the mark does not.

`domain/glyph-mask.ts` is that, and it is pure array maths over `Float32Array`
and `Uint8Array`: no canvas, no decoder, no clip. Which means it is testable, and
`tests/glyph-mask.test.ts` drives it with synthetic frames whose watermark is
known by construction.

### A halo is what you get for measuring against a blur

The first version found the mark by band-passing the averaged corner — a lightly
blurred copy minus a broadly blurred one — and thresholding once. On synthetic
frames it was perfect. On a real Veo clip it left a soft bright patch exactly
where the sparkle had been.

Two mistakes, and they compound:

1. **One threshold finds a core, not a mark.** A sparkle is a bright centre
   inside a wide, faint glow, and the glow is most of what the eye actually sees.
   A third of the peak catches the centre; everything else falls under the line.
2. **A blur cannot be the background under a glow.** Blur wide enough to ignore
   the glow is wide enough to ignore the gradient the mark is sitting on; blur
   narrow enough to follow the gradient has averaged the glow into itself. Either
   way the glow measures as background and survives.

The fix is a second pass. Cut the rough mark out of the averaged corner,
interpolate across it, and you have a real estimate of the footage rather than a
smeared copy of the mark. Measured against *that*, the glow stands at its true
height, and hysteresis — seed at a third of the peak, then grow through every
connected pixel still above a noise floor — follows it to its edge.

**A detector tested only on the shape you drew is tested on the easy half.** The
synthetic mark in the tests now has a glow, because the one that did not passed
while the tool was visibly broken.

### It is not a hole. It is an equation with one unknown.

The bigger mistake was upstream of any threshold: treating the mark as something
to cut out and fill in. It is not. A watermark is
`observed = (1 − a)·footage + a·white` — the footage is still there, underneath,
attenuated. Given `a` per pixel, rearranging hands it back exactly: grain,
texture, gradient and all. An inpaint invents a smooth surface; this recovers
what was filmed.

And `a` is obtainable, because the same interpolated background that fixed the
detection also supplies it: `a = (M − B) / (255 − B)` per channel, averaged over
whichever channels have headroom between `B` and white to mean anything. On the
synthetic sparkle that estimate lands within 0.008 of the truth.

Only the dozen pixels at the very centre, where `a` is near 1 and the division
stops being stable, have nothing left to recover — and those are inpainted
*after* the un-blend, so the border they read from is clean footage rather than
leftover glow.

**Ask what the artefact physically is before deciding what to do about it.**
"Fill the hole" and "undo the blend" produce visibly different results, and only
one of them is what happened to the pixels.

### A threshold set for confidence draws a ring you can see

`ALPHA_FLOOR` — below this opacity, leave the pixel alone — started at `0.03`,
which sounds cautious. It is a four-to-seven-level ring of leftover glow drawn
exactly around the mark, because at a mid-tone background one opacity point is
about 1.5 levels out of 255. The measured error fell from 7 levels to 2 by moving
it to `0.006`.

**Set a visibility threshold where things stop being visible, not where they stop
being certain.** The two are different numbers, and the diagnostic that separated
them — mean and max opacity error, banded by distance from the centre — took ten
minutes and ended a run of guessing.

### Shrink the work before the per-frame loop, not inside it

The search box is generous on purpose, but the per-frame work is the mask's
bounding box plus a margin of known picture. On a 1080p clip that is the
difference between reading back 46,000 pixels a frame and 12,000, over a
thousand frames. **Decide the geometry once, outside the loop.**

### The pump you write by hand is the pump that is wrong

The first version of this drove the muxer directly: two `CanvasSink`s, an
`EncodedPacketSink` for the audio, two async pumps under a `Promise.all`, and a
`try` wide enough to swallow whatever any of it threw. It failed on the first
real clip with `clean_failed` and nothing else, because that `catch` had eaten
the only sentence that said why.

Mediabunny's `Conversion` already owns everything that pump had to get right and
silently did not: the offset a clip's first timestamp carries, an edit list,
rotation metadata, per-track backpressure, and copying an audio track across
without decoding it. The genuinely tool-specific part is what happens to one
frame, and that is precisely the hook `Conversion` exposes:

```ts
video: {
    forceTranscode: true,          // painting a frame *is* a transcode
    allowRotationMetadata: false,  // bake rotation; the box was drawn in display orientation
    process: (sample) => {
        sample.draw(frameContext, 0, 0, width, height);
        // …read the work rect, inpaint it, put it back…
        return frame;              // the same canvas every frame; it is read before the next call
    },
},
```

The video track is re-encoded — no codec will change one corner of a compressed
frame without it. The audio track is not: its encoded samples are copied across,
and one the container cannot carry turns up in `conversion.discardedTracks`,
which is where `audioKept` comes from. It is **said out loud** in the result,
never quietly transcoded.

**Rule 45 in its second form.** "Depend or implement" is usually asked about
output somebody else reads. Ask it about *input* handling too: a container's
edge cases — edit lists, priming, negative timestamps — are somebody else's
twenty years of bug reports, and a pump written in an afternoon has none of them.

### Never let a `catch` eat the only sentence that says why

`catch { return failure("clean_failed") }` type-checks, satisfies "no swallowed
exceptions" if you read it quickly, and is useless. A reader gets a localised
sentence they can act on; whoever has to *fix* it gets nothing.

`VideoFailure` now carries an optional `detail` alongside `reason`, and the run
tracks which of six stages it is in. The reason is rendered; the detail is
logged and never rendered, which keeps rule 6 intact — an engine's error message
must not reach the page — while making the log line worth reading:

```json
{ "event": "watermark_remover.video_clean_failed", "reason": "clean_failed",
  "detail": "convert: EncodingError: Encoding error" }
```

**A named refusal is for the reader. A detail is for whoever gets the bug
report. They are different fields, and skipping the second one costs a
round trip.**

### A capability probe is a hydration bug wearing a disguise

`typeof VideoEncoder === "function"` is false on the server and true in a modern
browser, so a component that branches on it during render produces different
markup on the two sides. `domain/webcodecs.ts` says so at the definition, and the
panel reads it behind `useIsHydrated()` with "supported" as the pre-hydration
answer — the right guess for every browser that will actually run the code.

### The clip's own player cannot be the box editor

A browser draws its native control bar across the bottom of the frame, which is
exactly where a Gemini watermark sits. The two would have been fighting over the
same forty pixels, so the editor's `<video>` carries no `controls` and a slider
below the frame moves through the clip instead. **When an affordance and the
thing it exists to reveal want the same pixels, move the affordance.**

---

## Related

- [`../patterns/outbound-requests.md`](../patterns/outbound-requests.md#part-two-a-service-we-own)
- [`../design-system.md`](../design-system.md#tokens)
- [`image-codecs.md`](image-codecs.md) — the shared image layer this decodes
  through.
- [`../hydration-and-platform-pitfalls.md`](../hydration-and-platform-pitfalls.md)
  — why the WebCodecs probe sits behind `useIsHydrated`.
