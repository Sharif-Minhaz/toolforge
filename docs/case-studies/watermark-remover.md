# Watermark Remover — Three Machines Under One Name

`src/modules/watermark-remover/`. The tool has three tabs that share a heading and
nothing else, and most of what is worth recording here is about the seams between
them.

**Part one** — the picture tab — is about calling a Workers AI model, and applies
equally to every other tool that fronts one (`ai-image-detector`,
`ai-text-detector`, and the image half of `equation`).

**Part two** — the video tab — is about doing the same job with no service at all.

**Part three** — the Gemini image tab — is part two's arithmetic run on a single
sample, and is mostly about what averaging was buying and what has to replace it.

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
smeared copy of the mark. Measured against _that_, the glow stands at its true
height, and hysteresis — seed at a third of the peak, then grow through every
connected pixel still above a noise floor — follows it to its edge.

**A detector tested only on the shape you drew is tested on the easy half.** The
fixture then said this and did not do it: the mark in `tests/glyph-mask.test.ts`
stayed a hard-edged diamond at one flat opacity for two more rounds, and passed
every one of them green while the tool shipped a visible sparkle. It has a glow
now, and the glow is what the assertions are about.

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
_after_ the un-blend, so the border they read from is clean footage rather than
leftover glow.

**Ask what the artefact physically is before deciding what to do about it.**
"Fill the hole" and "undo the blend" produce visibly different results, and only
one of them is what happened to the pixels.

### Averaging three ratios is not the same as fitting three channels

`a = (M − B) / (255 − B)`, taken per channel and averaged, is correct arithmetic
and a bad estimator. Over a bright corner one channel's headroom can be eight
levels, so two levels of noise become an opacity of a quarter — and subtracting a
quarter of white from a pixel that never had it is a dark, faintly coloured
blotch. Averaging lets the least trustworthy channel carry equal weight.

Fitting all three at once, weighted by the headroom each actually has, does not:

```
a = Σ(M − B)(255 − B) / Σ(255 − B)²
```

A channel with no room to say anything contributes almost nothing to either sum.

### Bound the correction by what is physically possible, not by what was estimated

White was _added_ to the pixel, so the footage underneath was darker than what is
there now — and never negative. That bounds the opacity from below the pixel
itself: `a ≤ observed / 255` in **every** channel, or the arithmetic is claiming
light was removed that was never there.

One pass over three bytes, applied before the estimate is used, and every
over-subtraction artefact is gone regardless of how the estimate went wrong.
**An estimator can be improved; an invariant cannot be violated.** Where both are
available, enforce the invariant and treat the estimator as an optimisation.

### A blur is the wrong tool where the signal has structure

The obvious defence against a speckled opacity map is to blur it. Measured, it
cost up to two tenths of opacity across a sparkle's thin arms — where the map has
real structure one pixel wide — and bought nothing over the glow, where it was
already flat. It made the result nine times worse at the core.

Both of the actual causes were fixed at their source instead. **A smoothing pass
laid over a wrong number is a way of not finding out why the number was wrong.**

### State the output size, or something else will

The frames were painted on a canvas sized from `getDisplayWidth()`, and the
encoder was left to take its box from the input. Those agree right up until they
do not — a clip carrying rotation metadata, a pixel aspect ratio that is not 1:1,
a resolution that changes part-way through — and when they disagree the frame is
fitted into a box of the wrong shape. A fit that preserves aspect ratio pays for
that in **bars of black baked into the picture**, which is what turned up in some
frames of some clips and not others.

Stating `width`, `height` and `fit: "fill"` explicitly means there is one size in
the pipeline and nothing left to letterbox. **A default that is usually the same
as your assumption is not the same as your assumption.**

### Un-blending amplifies noise, and the amplification is shaped like the mark

`b = (o − a·255) / (1 − a)` is exact arithmetic on exact inputs. A compressed
frame is not an exact input: it is made of small errors, and that division hands
every one of them back multiplied by `1/(1 − a)`. At nine tenths covered, that is
ten times.

So the opacity can be perfect, the bound respected, the background right — and
the corner still comes back visibly grainier than the picture around it, in
precisely the shape of the mark. "It is not smooth" is a different complaint from
"there is a stain", and it has a different cause.

Past about half covered, what is being recovered is mostly amplified noise, so
that part is rebuilt from its surroundings instead — and the two answers are
**cross-faded** between a half and three quarters rather than swapped at a line,
because a hard boundary between recovered and invented pixels is itself an edge,
drawn along a contour of the mark.

**Every reconstruction has a noise gain. Know what it is before trusting the
output.**

### A relaxation that lands on the average converges in the square of the width

Replacing a pixel with the average of its neighbours, over and over, does reach
the harmonic surface — in about `n²` sweeps for a hole `n` across. The background
estimate interpolates across the whole mark, glow included, which on a real clip
is a hole a hundred pixels wide. Ten thousand sweeps; it was given four hundred.

What that leaves is a middle sagging toward the average of its rim, which over a
corner with a gradient across it is a background estimate that is too dark — and
therefore an opacity that is too high, and a mark-shaped patch subtracted out of
a frame that never had that much white in it. Measured: 5.4 levels of sag.

Overshooting each correction instead of landing on it converges in about `n`.
One coefficient, `1.9`, and the sag drops under 3. `tests/inpaint.test.ts` pins
it with a sixty-pixel hole cut into a gradient, and reverting the coefficient to
`1.0` fails it — which is the only reason to believe the test.

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
frame without it. The audio was _supposed_ to be copied, and driving the real
tool in a browser is what showed it was not: the output came back carrying Opus
where the source had AAC.

The reason is worth knowing. AAC inside an MP4 carries a few hundred samples of
encoder priming, which puts its first sample fractionally before zero; a file
that must start at zero has to be trimmed, and trimming cannot be done to encoded
packets. So the muxer transcodes — and left to its own preference it reached for
Opus, which is legal in an MP4 and which QuickTime and Safari will not play. For
a tool whose whole promise is a clip you can post, that is the wrong trade at any
bitrate, so the codec is now named: AAC first, Opus only where the browser has no
AAC encoder, and the result **says which one it wrote**.

**Copy that says "copied, bit for bit" is a claim about behaviour, and a claim
about behaviour has to be run.** This one was wrong for two rounds because it
was only ever reasoned about.

**Rule 45 in its second form.** "Depend or implement" is usually asked about
output somebody else reads. Ask it about _input_ handling too: a container's
edge cases — edit lists, priming, negative timestamps — are somebody else's
twenty years of bug reports, and a pump written in an afternoon has none of them.

### The corner of a real clip is not empty, and brightness cannot tell you what a mark is

Every algorithmic fix above was measured against synthetic frames: a mark drawn
on a smooth gradient, alone. Real corners are not like that. Extracting the
actual corners of two Gemini clips with `ffmpeg` and running the detector over
them directly — no browser, no video plumbing, seconds per iteration — showed
what the tests could not:

- The clips have **static bright content beside the mark**: a subtitle sitting
  still for eight seconds, the lit edge of a card, a honeycomb pattern laid over
  the artwork. "What does not move is the mark" cannot separate those from a
  sparkle, and all of them are brighter than it.
- Worse, the scenery **touches** the mark, so a flood from the sparkle runs out
  along a hexagon edge. Measured: the mark came back as 324x317 inside a
  400-pixel window.
- The default box was **flush into the corner**, which put the mark against its
  inner wall with the glow clipped on two sides — and the background estimate
  reading its values out of the mark's own edge.

Three fixes, in the order they matter:

1. **Put the box where the mark is.** Measured on both clips, the sparkle centres
   at 0.17 of the frame's shorter side in from each edge — 120 px and 123 px on a
   720x1280 clip, 95 px and 100 px on a 1024x576 one. The same ratio twice.
2. **Keep one blob, the one in the middle.** The box already implies the
   contract: the reader put it over the mark, so the mark is the thing in the
   centre and everything else is scenery.
3. **Part the joins before choosing.** Brightness cannot separate a sparkle from
   a caption's underline; _thickness_ can. An erosion before the choice and a
   dilation after it — a morphological opening — drops every structure a few
   pixels wide and leaves a glyph tens of pixels across untouched.

**Build the fast diagnostic loop before the third round of guessing, not after.**
Two rounds of fixes were aimed at artefacts reasoned about from screenshots. The
loop that ended it — `ffmpeg` for frames, the real domain functions on those
frames, a number for how visible the residue is — took ten minutes to build and
found the actual cause immediately.

### …and the loop needs an answer key, or it only tells you what changed

That loop measured the residue against _nothing_. It said how much lift was left
where the mark had been, which falls as the estimate improves and also falls when
the detector quietly stops finding the mark — and the second is what happened
next. Three fixes later the corner was measurably flatter and the sparkle was
still there.

What it was missing is a clip with the answer in it. `ffmpeg` will build one:
encode the footage once losslessly, then encode it twice from that master — once
plain, once with a known sparkle laid over it at a known per-pixel alpha — and
the plain one is what the cleaned one is supposed to equal, compression
artefacts and all.

```
base.mkv ──libx264 -crf 20──────────────────────────────► clean.mp4   (the answer)
    └────► overlay=sparkle.png ──libx264 -crf 20────────► marked.mp4  (the input)
```

That turns "is it better?" into four numbers — mean and worst error over the
core, the glow, and the picture that should not have been touched at all — and
those numbers are what every claim below is. Three corners are worth building:
an almost-black one, where a leftover glow or an over-subtraction is most
visible; a bright busy one; and one with a caption sitting still under the mark,
because that is the corner every fix here was quietly wrong about.

**A residue metric with no ground truth cannot tell an improvement from a
detector that has given up.**

### Bound the mark by the mark, not by the box

Every radius in the detector was a share of the search box: how far to dilate
before estimating the background, how thin a structure had to be to be discounted,
how much of the box a blob was allowed to span. All of them are the wrong
quantity. The reader can resize that box, and when they do, the same clip is
measured differently — but the mark did not change size.

Worse, the one that mattered most was too small. The background under the mark is
estimated by interpolating across a hole, and the hole was a fixed dilation of the
core; on a real glow its border still stood **inside the halo.** So the halo
measured as background, the opacity came out low, the mask stopped early, and the
ring left behind is what a reader means by "it is still there". Measured on the
dark corner: 1,925 pixels of real mark estimated at zero opacity, and 20 levels of
residue over the glow after cleaning.

The replacement is one disc, sized from the mark's own core and **grown until the
mark stops pressing on its rim**. A first guess comes from the core's radius —
a glow belongs to the glyph casting it — but only a guess, because the band-pass
that finds the core measures it against a wide blur and anything bright nearby
lifts that blur: on the corner with the caption, a 50-pixel sparkle came back as
20, and a disc sized off it once was drawn well inside the mark. Measure, and if
the mark runs into the rim of the disc it was measured in, the disc was too small.
Widen and measure again.

| corner                       | glow residue, before → after | worst opacity error |
| ---------------------------- | ---------------------------- | ------------------- |
| dark, mark alone             | 21.9 → 5.6                   | 0.025               |
| bright, mark alone           | 11.5 → 3.2                   | 0.027               |
| dark, caption under the mark | 21.6 → 10.4 (edge band)      | mark found at all   |

**When a measurement is circular — the mark's extent decides where the background
is read from, and the background decides the mark's extent — iterate it instead
of guessing a constant.** Four steps of half again, once, before the per-frame
loop starts.

### A guard that fires when the detector works is not a guard

`MAX_COMPONENT_SPAN_RATIO` refuses a blob spanning most of the search box, on the
sound reasoning that a watermark is compact and a caption is not. It was applied
to the _grown_ mask — the one that includes the glow. So the better the detector
got at following the halo, the more likely it was to be refused: with the glow
finally captured, the mark spanned three quarters of a snug box and the tool
answered `mark_not_found`, which is the one failure a reader can do nothing
about.

It now applies to the **core** the first pass finds, and the second pass grows
that core rather than deciding again what the mark is. Same rule, correct
subject.

**Check which object a sanity rule is actually about. A cap on "too big to be a
mark" belongs on the part of the mark whose size is bounded.**

### The fill must not read from anything bright, mark or not

A harmonic fill takes its answer from the border of the hole. The disc's border
is clean footage by construction — except where scenery crosses it, and a caption
running under a mark does exactly that. A bright bar lying across the rim lifts
the whole estimate, and every opacity measured under it comes out too low: on the
caption corner the opacity collapsed past four fifths of the core's radius and 55
levels of sparkle stayed in the picture.

So everything bright and standing still goes into the hole, whether or not it
turned out to be the mark. Only the values inside the disc are ever read, so
filling across a caption as well costs nothing.

### Thickness parts what touches the mark, until it overlaps it

An erosion before the component choice and a dilation after it drops every
structure a few pixels wide, which is what a caption's bar, a card's lit edge and
a honeycomb seam are. One fixed radius cannot do it — it has to exceed half the
thickness of whatever is fused to the mark, and how thick a caption is has nothing
to do with the box — so the opening **escalates** until what is in the middle is
compact enough to be a mark, and stops at the first radius that manages it. A
glyph that is already compact is answered on the first try and never eroded.

Where the caption genuinely lies _underneath_ the glow, no thickness test can
help: there it is not a thin thing joined to a thick one, it is part of the same
blob. That overlap is repainted. Measured on the caption corner, that is 8 levels
of mean damage across the pixels that should not have been touched, against 174
levels of sparkle removed — the right trade, and the reason it is written down
here rather than left to be rediscovered.

### The fill was accurate. What it was accurate about was wrong.

Every artefact left after the reach was fixed looked like a fill problem: a grey
patch in the shape of the mark, its colour dragged toward neutral, the texture
around it smeared. The obvious reading is that diffusion is too weak a
reconstruction, and the obvious next move is a stronger one.

The measurement says otherwise, and it takes ten lines. Run the same fill over
the same holes on the **true** footage — the clip encoded without the mark — and
see what a perfect answer would have scored:

| corner         | tool | a perfect fill of the true footage |
| -------------- | ---- | ---------------------------------- |
| dark, smooth   | 14.9 | **0.8**                            |
| bright, smooth | 16.1 | **0.9**                            |
| honeycomb      | 21.9 | **10.5**                           |

Diffusion was leaving one level on the table where the tool was leaving fifteen.
The fill was not inventing badly; it was **faithfully propagating a bad border**.

**Before replacing a mechanism, run it on perfect inputs.** The gap between what
it scores there and what it scores in the tool is the only part worth working on,
and it is often not where the artefact appears.

### Where a fill may read from is a different question from how much of it to use

The border was the half-covered contour, because one number was answering two
questions. How much of a pixel to invent is a question about noise gain, and
`1/(1 − a)` puts the answer around half covered. Where the fill may **read** from
is a question about how trustworthy the un-blend is there — and `1/(1 − a)` says
the exact opposite: at half covered, every error in the opacity comes back
doubled.

Measured on a saturated brown corner, an opacity three per cent low at that
contour desaturated the border by fifteen levels, and the fill carried it
inward. The arithmetic is worth seeing, because it explains the colour:

```
o_c = (1 − a)·b_c + 255a          →     o_r − o_b = (1 − a)(b_r − b_b)
un-blend at ā instead of a        →     b′_r − b′_b = (1 − a)/(1 − ā) · (b_r − b_b)
```

Under-estimate `a` and every channel is dragged toward the others. **An opacity
that is slightly low does not make a patch slightly wrong. It makes it grey.**

So the hole now runs out to where the mark is faint — `FILL_BORDER_ALPHA`, a
tenth — while the weight stays the narrow ramp it was. The extra ring is
interpolated and then almost entirely discarded; what it buys is a border made of
footage.

| corner    | core residue, before → after             |
| --------- | ---------------------------------------- |
| dark      | 14.9 → **6.0**                           |
| bright    | 16.1 → **4.5**                           |
| honeycomb | 21.9 → **14.5**, against a floor of 12.9 |

### A cross-fade written in opacity is not a cross-fade on a hard edge

The ramp from recovered to rebuilt runs from `a = 0.5` to `a = 0.75`, and the
reasoning behind it — a hard boundary between them is itself an edge — is right.
It just does not survive contact with a glyph. A logo goes from covered to clear
in one or two pixels, so the whole ramp is crossed inside those pixels and the
fade degenerates into exactly the switch it was designed to avoid, drawn along
the mark's own contour. That thin dark outline tracing the sparkle, after
everything else was right, was this.

The weight map is feathered **in space** now, a couple of pixels, so the
transition is a fixed width however fast the opacity moves.

**Smoothing the opacity is forbidden and smoothing the weight is required, and
they look like the same operation.** One is a measurement — blurring it costs two
tenths across a sparkle's arms and hides why it was wrong. The other is a blend
control and has no truth to lose.

### The mark's outline carries what the averaged frames cannot

Along that same contour the frame holds two things no opacity can subtract,
because neither is in the average it was estimated from: the codec's ringing at a
hard edge, and — worse — a chroma sample taken from a 2x2 block that is half mark
and half footage. 4:2:0 means the colour of the mark's edge is _mixed into_ the
colour of the picture beside it before the tool ever sees the frame.

Both want the same answer, which is to rebuild that band outright rather than
un-blend it. It is one or two pixels wide, and a fill closes a hole that size
invisibly. What it is worth, measured by taking it out again:

| corner    | core residue with the band | without it       |
| --------- | -------------------------- | ---------------- |
| dark      | 5.0 (worst 8)              | 26.7 (worst 157) |
| bright    | 3.2 (worst 5)              | 13.1 (worst 67)  |
| honeycomb | 14.3 (worst 66)            | 25.4 (worst 107) |

**When a model cannot represent something, find where that thing lives and take
those pixels out of the model's hands.** Do not widen the model until it covers
them.

### Stop a relaxation when it has settled, not when the budget runs out

The iteration count is sized for the worst hole the tool can be handed — a hole
as wide as the mark, which over-relaxed needs about its own width in sweeps. Most
frames are nowhere near it, and the rest of the budget is spent on every frame of
the clip.

Stopping when no pixel has moved by a quarter of a level — less than a byte can
hold — took the per-frame cost from 92 ms to 32 ms with the same answer, which is
also **less than the 58 ms the smaller, worse version cost.** The fix and the
speed-up are unrelated, and doing both is why enlarging the hole was affordable.

### The denominator is the whole story: `Δa = ΔB / (255 − B)`

Reported as "it cannot handle the frames where the video goes from dark to
white", and that is exactly what it is, though the fault is not in those frames.

The background under the mark is estimated once, from the averaged corner, and
whatever it is wrong by becomes an opacity error through

```
a = (M − B) / (255 − B)      →      Δa = ΔB / (255 − B)
```

Ten levels of error in `B` is a hundredth of opacity over a dark corner and a
tenth over a corner near white. A hundredth is invisible. A tenth is a tenth of
white subtracted from a pixel that never had it — a patch a reader can point at,
appearing on exactly the frames where the picture brightens, on a clip where
nothing else changed. It reads as "bright frames are the hard case". It is a
background estimate that was always slightly wrong, with a denominator that
stopped hiding it.

**When an error is divided by something that varies, the symptom appears where
the divisor is small and the cause lives somewhere else entirely.**

Measured on a clip rendered to do precisely this — black to blown out over two
seconds, with a near-saturated streak crossing the mark half way — the opacity
came back a flat four hundredths low across the whole glow. Not a scale error, an
_offset_, which is the signature of a background that is uniformly too bright.

### Two things were wrong with it, and the second one is not obvious

The first is the familiar one, one layer further out. The reach disc stopped
growing when the _thresholded_ mask no longer touched its rim — but the threshold
is where the glow stops being worth repainting, not where it stops. Past it the
glow runs on for another third of its radius at a hundredth of an opacity:
invisible in the output, and sitting squarely in the rim the background is read
from. The test is now an absolute lift measured on the rim itself, under a level,
asked of the picture rather than of the threshold.

The second only shows up once the first is fixed, and it took an experiment to
see rather than an argument. Hand the opacity fit a **true** background — the
same clip encoded without the mark — and it lands within 0.007 everywhere. Hand
it the interpolated one and it is 0.022 low. So the averaging is right, the
headroom-weighted fit is right, and every remaining level of error is the
interpolation.

Which is not surprising once stated: a harmonic fill knows exactly one thing,
the values on the rim of its hole, and by then the hole was a hundred and thirty
pixels across. It sags toward whatever surface that rim implies.

The premise the module already rests on says what to do instead. Averaging a
moving corner over two dozen moments leaves a gradient rather than detail — so
the background is not merely smooth, it is **low order**, and a low-order surface
can be _fitted_ to every pixel outside the mark and then evaluated inside it.
That is extrapolation from hundreds of pixels instead of interpolation from a
ring. The residual is still filled in harmonically on top, so anything the
surface misses near the rim is still carried inward: model for the shape, fill
for the rest.

A quadratic. A cubic was tried and is worse — on a bright corner it scored 3.6
against the quadratic's 1.3, which is a fit spending its extra freedom on noise.

| corner                                  | before this round | rim test | + fitted background |
| --------------------------------------- | ----------------- | -------- | ------------------- |
| black → white, streak crossing the mark | 11.8              | 7.1      | **3.6**             |
| dark                                    | 5.0               | 1.8      | 1.9                 |
| bright                                  | 3.2               | 3.2      | **1.3**             |
| honeycomb                               | 14.3              | 14.3     | 14.8                |

**Interpolating across a hole uses one ring of pixels. Fitting a model uses all
of them. When the thing being estimated is known to be smooth, that is not a
stylistic choice.**

### One of these is pinned by a harness and not by a test, and that is worth saying

The fitted background is covered by a unit test: revert it and two assertions
fail. The rim-flatness rule is not, and it cannot easily be.

To catch it, the fixture's averaged corner has to carry structure a low-order fit
_cannot_ follow, so that the rim actually matters — and a static, high-frequency
ripple strong enough to do that is, by construction, indistinguishable from a
watermark on a corner with no watermark in it. Adding one turned "refuses a
corner with nothing standing in it" red, which is a true statement about the
detector and a useless fixture.

So that rule is held by the `ffmpeg` harness instead — 3.6 with it, 10.9 without
— and this paragraph exists so the next person to read `REACH_RIM_FLAT_DELTA` and
find no test for it knows it was measured rather than guessed, and knows why the
measurement does not live in `bun test`.

**When a rule cannot be pinned by a test, say so where the rule is, and say what
did pin it.** A silently untested constant and a deliberately untested one look
identical six months later.

### Every number above came from a synthetic mark at nine tenths opacity. The real one is at a third.

Two real Gemini clips, run through the real domain functions with `ffmpeg` for
frames: the mark peaks at an opacity of **0.32**, not the 0.9 every fixture in
this module draws. That single number invalidates the operating assumption behind
half of the machinery here.

At 0.32 the noise gain `1/(1 − a)` is 1.47, so the cross-fade to a rebuilt core
never fires, `ALPHA_UNBLEND_MAX` never binds, and the un-blend on its own is
close to exact — which the stage dump confirms: with the rebuild switched off the
sparkle simply goes. **The parts of this module that exist to handle a strongly
covered mark are, on the clips it was written for, doing nothing except when they
do damage.**

**A fixture parameter copied from an assumption is an assumption, and it will be
inherited by every measurement made against it.** Two rounds of numbers in this
document were tuned against a mark three times more opaque than the real one.

### A threshold set at the noise floor describes the noise

The defect a reader actually saw. `planRebuild` took `alpha > ALPHA_FLOOR` — a
hundredth of an opacity — dilated it, eroded it, and rebuilt the difference, on
the reasoning that this is a thin ring around the mark's outer edge where the
codec rings.

Around a smooth synthetic mark it _is_ a thin ring, and it measured as costing
nothing and buying about two tenths of a level. On a real clip an opacity map is
made from two dozen compressed frames and a hundredth of an opacity is far below
its noise, so the region is not a disc at all — it is speckle. And
`dilate(speckle) − erode(speckle)` is not a ring. It is **everything**: the
rebuild map came back covering most of the work rect, and the tool interpolated a
whole corner it had already cleaned correctly. Dumping the five stages of one
real frame side by side — before, opacity, rebuild weight, un-blend only, final —
showed it in one look, after several rounds of reasoning about finished output
had not.

Ringing lives where the mark has an _edge_, so ask for the edge. The outline band
that `steepAlpha` finds does that already and is measured; the outer ring is
gone.

**When a threshold sits where the quantity is indistinguishable from noise, the
region it defines is a description of the noise.** Morphology on such a region
amplifies rather than smooths.

### Removing added white can only darken. That is an invariant, not an estimate.

There is no arrangement of footage and overlay for which taking the overlay away
adds light. The un-blend satisfies it by construction: `(o − aW)/(1 − a) ≤ o` for
every `o ≤ W`.

The rebuild does not, because a fill answers to its neighbours rather than to the
pixel it replaces. On the one frame of a real clip where a lens flare crosses the
mark, it invented a patch **42 levels brighter** than what was there — a bright
blob, on the one frame in the clip where the eye is already drawn.

One `Math.min` against the input. Afterwards, every frame of both clips changes by
`max 0`: the tool only ever removes light, which is the only thing it is for.

**Where a physical invariant and an estimator disagree, the invariant is free and
the estimator is not.** This is the second time that sentence has been earned in
this file — the first was the per-channel bound on the opacity — and both times
the estimator looked fine on synthetic input.

### On the real clips, then

The mark's standing lift above its own neighbourhood, averaged over the clip:

| clip                  | before | after     |
| --------------------- | ------ | --------- |
| `gem.mp4`, 720x1280   | +58.5  | **+3.8**  |
| `trash.mp4`, 1024x576 | +55.8  | **+14.1** |

A ghost outline is still visible on some frames of `trash.mp4`, and the honest
reading of +14.1 is that it is not finished. What is finished is the part that
made it _worse than doing nothing_.

**A residue metric averaged over frames hid this for a whole round.** The error
from a mis-estimated overlay is proportional to how far a given frame's footage
sits from the clip's average, so it changes sign across the clip and averages to
near zero while every individual frame shows a smudge. Per-frame worst case, or
nothing.

### Run the whole thing in a browser, on the file somebody complained about

Everything above was measured with `ffmpeg` for frames and the domain functions
called directly. That is the right loop — seconds per iteration — and it cannot
see the half of the tool that is mediabunny, WebCodecs, the encoder and the
audio track.

`bun build` bundles `cleanVideo` for the browser in one command; a twenty-line
Bun static server and Playwright's Chromium do the rest. On the two real clips:

```
gem.mp4    720x1280   4.3 s   audioKept: true   audioCodec: "opus"
trash.mp4  1024x576   5.8 s   audioKept: true   audioCodec: "opus"
```

No failures, and the audio fallback earned its keep on the first run: this
Chromium has no AAC encoder, so `getFirstEncodableAudioCodec` fell through to
Opus and the result **said so**. That is the field this case study argued for
being right in the one place it matters — a build without proprietary codecs,
which is what an open-source Chromium is.

**The fast loop and the real one answer different questions.** Keep both, and do
not let the cheap one stand in for the expensive one at the end.

### Measure against a ring, not against a bounding box

"How much does the mark's area still stand above its neighbourhood" counts real
picture too: a hexagon seam inside the mark's bounding box scores as residue. It
put `trash.mp4` at +13.9 and made the tool look far worse than it was.

The question is whether the mark's area is _anomalous_, so compare it with a ring
around it, at two scales — a small high-pass for texture and a large one for
mark-sized offsets — and take the ratio. One is indistinguishable.

Measured on the files the browser actually wrote:

| clip        | scale | input | output   |
| ----------- | ----- | ----- | -------- |
| `gem.mp4`   | fine  | 17.8  | **1.29** |
| `gem.mp4`   | broad | 6.4   | **0.86** |
| `trash.mp4` | fine  | 3.4   | 1.86     |
| `trash.mp4` | broad | 2.8   | 1.56     |

`gem.mp4` comes back under 1 at the broad scale — the mark's area is _smoother_
than the picture around it, which is what gone looks like. `trash.mp4` is halved
and still visible.

### The residue that cancels in the average and not in a frame

The averaged cleaned corner of `trash.mp4` scores 0.28 — excellent — while its
individual frames score 1.56. Both are true, and the difference is the whole
diagnosis.

```
a − â   =  ΔB(1 − a) / (255 − B)
error_t ≈  ΔB · (255 − bₜ) / (255 − B)
```

The per-frame error is the background error scaled by how far _this_ frame's
brightness sits from the clip's average. Over a clip that swings from dark brown
to bright orange that factor runs from about 0.6 to 1.6 — so the error changes
sign across the clip and averages to nearly nothing, while every individual frame
carries it.

Two consequences worth keeping. **An estimate can be unbiased and still wrong in
every frame.** And this is the second time in this file that averaging over
frames hid a defect; a per-frame worst case is the only honest form of this
metric.

Note also what the arithmetic does _not_ say: the error is not amplified by the
headroom. It is about `ΔB` itself, one for one. The whole remaining budget is the
background estimate, whose error on this clip's own footage is 4 levels median
and 16 at the ninetieth percentile.

### Five things that did not work, each measured

Worth recording so they are not tried again:

- **More frames in the average.** 24 → 120 samples: the inside-mark figure does
  not move (4.2 at every count). The error is spatial and persistent, not sample
  noise.
- **Estimating per frame and taking the median.** 13.9 → 13.1. The bad frames are
  not outliers; every frame is wrong the same way, because the footage's
  structure at that spot persists.
- **A smaller hole for the background** (0.4x to 1.0x of the reach): no signal.
- **A robust, outlier-rejecting surface fit** (Huber, three passes). It improved
  the background error slightly on paper — median 4.4 to 4.0 — and changed
  nothing end to end. Reverted rather than kept: unmeasured machinery is a
  liability, and this module has a rule about smoothing passes laid over numbers
  that are wrong for another reason.
- **Correcting the background by a fitted global offset.** The objective — how
  much the mark's area stands out from its ring after cleaning — is already
  minimised at a shift of zero, on both clips. There is no constant left to
  remove.

**Motion compensation was ruled out before building it.** If the footage
translated, the picture under a fixed mark would be _observable_ in another frame
and the opacity could be measured rather than inferred. It does not: a global
translation search returns shifts pinned at the search limit with residuals up to
108 levels, so the motion is not a translation. Ten minutes to find out, against
a day to build the wrong thing.

### The mark has a dark half, and `o = (1 − a)·b + a·W` cannot see it

Every equation in this file adds light. The real mark does both: outside the
bright glyph there is a shallow dark ring, four to seven levels deep, reaching
about two and a half times the glyph's radius. Both real clips have it, at the
same proportions. A tool built entirely on the un-blend removes the sparkle and
leaves the ring — which is exactly the grey outline a reader points at and calls
the watermark still being there.

Proving it took a control, because "the corner is darker than the background
estimate says" is equally consistent with the estimate being wrong. Cut the same
hole into patches of the same clip that contain **no mark** and the estimator
reads systematically _high_ in the middle of its hole. So the ring is not that —
correcting for the known bias makes it deeper, not shallower. And on the clip
whose control bias is essentially zero, the ring is there at full size.

Its colour rules out the obvious explanation as well: it takes most from the
channel whose background is _darkest_, and an alpha composite of any single
colour does the opposite. So the halo is carried as **what it measures**, a
signed field, rather than as an opacity of an invented colour. Recording the
number honestly beats a model that fits the story and not the data.

**Ask what a model cannot represent, not only whether it fits.** This one fits
the bright half beautifully and has no term at all for the other half.

### Two defects can hide each other, and then neither is visible

The dark ring sat outside the reach disc, so nothing measured it. The disc
stopped there because the growth test asked whether the rim's lift was _above_ a
floor — and the ring's lift is below it. Each defect made the other unobservable:
fix the sign and the ring is still outside the disc, fix the disc and there is no
code that looks for a ring.

Then a third, in the same place. The obvious growth test — is the residual flat
at the rim — cannot work at all, and only a fixture with a ring of known depth
showed it: the background is fitted to everything outside the hole, so outside
the hole the residual is zero **by construction**. The test was asking a question
whose answer was built in. The signal has to be read against the _smooth model_,
which cannot follow a ring, in a band beyond the disc.

### Subtract only what is arranged around the mark

Measured pixel by pixel, the dark half is two things at once: the mark's ring and
the background estimate's own error, and on a patterned corner the second is four
levels typically and sixteen in the tail — larger than the thing being looked
for. Subtracting that pixel by pixel paints the estimator's mistakes into the
picture as a smeared patch the size of the search box. It was clearly worse than
the ring, and the browser output showed it immediately.

A ring belongs to a fixed graphic, so whatever it is, it is arranged around the
mark's centre; an estimator's error is not. Averaging each ring of pixels before
subtracting keeps the first and cancels the second, and costs one pass. On top of
that the correction is skipped entirely when the smooth surface does not track
the corner — measurable before it is used, as the RMS gap between the data and
the model where the data is known.

**When a correction measures the thing you want plus the thing you fear, find the
symmetry the first one has and the second one does not.**

### Where it stands, on the two clips, from the files the browser wrote

| clip        | scale | input | output   |
| ----------- | ----- | ----- | -------- |
| `gem.mp4`   | fine  | 17.5  | **1.11** |
| `gem.mp4`   | broad | 6.7   | **0.83** |
| `trash.mp4` | fine  | 3.4   | 1.91     |
| `trash.mp4` | broad | 2.8   | 1.62     |

`gem.mp4` is done: the mark's area is statistically indistinguishable from the
picture around it at both scales, and looks it.

`trash.mp4` is not, and the reason is measured rather than guessed. Its corner is
a moving honeycomb, which the smooth background surface tracks to four levels
typically and sixteen at the ninetieth percentile — and the per-frame error of
the whole method is exactly that number, one for one. The remaining lever is a
background estimate that can follow structure rather than smooth over it:
exemplar or patch-based synthesis, run once per clip on the averaged corner,
where its cost does not matter. Everything cheaper has been tried and measured in
the sections above.

### Plant a known mark on the clip's own footage

The background under a real mark is unobservable, so nothing measured against a
real clip has ground truth in it. Every metric above is therefore a proxy, and
proxies mislead — twice in this file already.

There is a way to have both. Take the mark this clip actually carries, composite
it onto a patch of the same clip **somewhere it is not**, clean that, and compare
with the untouched original. Real texture, real compression, real opacity, and
the answer still there to check against.

It immediately settled a question that three proxies had answered differently:

| outline band | opacity   | core error |
| ------------ | --------- | ---------- |
| on           | estimated | 10.6       |
| on           | true      | 8.7        |
| off          | estimated | 4.9        |
| off          | **true**  | **0.7**    |

Two things fall out. The un-blend on a correctly measured mark is **exact** — 0.7
levels, which is rounding. And the rebuild's outline band, justified on a
nine-tenths-opaque mark with a hard edge, is the largest single error on a mark
at a third opacity, where there is no hard edge to ring.

**A metric without ground truth cannot rank two options that trade different
kinds of error.** The inside-versus-ring ratio penalises noise; the truth
penalises being wrong. The band replaces noisy-but-correct pixels with
smooth-but-invented ones, so it wins on the first and loses on the second.

### …and then not shipping the change it argued for

Gating the band off for weak marks is what that table says to do, and end to end
on the real clips it made the output **worse**, not better: a visible rectangle
and a half-removed sparkle. The band had not been causing that error — it had
been _covering_ one. On `trash.mp4` the reach disc grows to 153 px inside a
173 px box, so the opacity is estimated across an area far larger than the mark,
and a smooth fill over the top was hiding how wrong it was over that whole area.

So the band stays on, and the finding stands: the recovery is exact when the
opacity is right, and the opacity is not right over a large reach on a
structured corner. Those are the same conclusion from two directions.

**A measurement that says "remove this" can be right about the thing and wrong
about the change.** Take the mask off a defect and you see the defect; that is
progress, not regression, but it is not something to ship on its own.

### Exemplar synthesis: measured, and it does not help

The remaining idea for the background estimate was patch-based synthesis —
continue the honeycomb across the hole instead of smoothing over it. Prototyped
against the same control patches:

| estimator       | median | p90  | p99  |
| --------------- | ------ | ---- | ---- |
| diffusion       | 4.0    | 15.8 | 28.6 |
| patch synthesis | 4.1    | 15.9 | 29.0 |

Identical, and the reason is worth keeping. Exemplar synthesis produces
**plausible** texture, not **correct** texture. For painting a hole that is the
whole point; for estimating an opacity it is worthless, because the error against
the real background is unchanged. Five minutes of prototype instead of a day of
integration.

**Know which property of a technique you actually need.** "Looks right" and "is
right" are different requirements, and most inpainting literature optimises the
one this module does not need.

### What is under a solid core is gone, and no arithmetic returns it

With all of the above, a smooth corner comes back within about two levels — the
mark is gone and what replaces it is the right colour. A **strongly textured**
one does not, and cannot: on the honeycomb the tool sits at 14.8 against a
diffusion floor of 12.9, so almost everything left is diffusion being asked to
invent a hexagon seam, and it invents a smooth surface instead. The seams come
back broken where they ran under the mark.

That floor moves only by changing what does the inventing — an exemplar or
patch-based fill, or better, taking the pixels from another frame, since footage
that pans has shown what is under the mark at some other moment. Neither is a
constant to tune, and the numbers say plainly which is worth building: on a
smooth corner nothing is, and on a textured one nothing else is.

**Know which part of a result is recovered and which part is invented, measure
the invented part against a perfect version of itself, and stop tuning whichever
one is already at its floor.**

### Never let a `catch` eat the only sentence that says why

`catch { return failure("clean_failed") }` type-checks, satisfies "no swallowed
exceptions" if you read it quickly, and is useless. A reader gets a localised
sentence they can act on; whoever has to _fix_ it gets nothing.

`VideoFailure` now carries an optional `detail` alongside `reason`, and the run
tracks which of six stages it is in. The reason is rendered; the detail is
logged and never rendered, which keeps rule 6 intact — an engine's error message
must not reach the page — while making the log line worth reading:

```json
{
    "event": "watermark_remover.video_clean_failed",
    "reason": "clean_failed",
    "detail": "convert: EncodingError: Encoding error"
}
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

## Part three: the same equation, one sample

The Gemini tab is not a third algorithm. It is `detectWatermark` and
`removeOverlay` — part two's own code, unchanged — handed a `FrameAccumulator`
with exactly one frame in it. Everything below is about what that costs and what
had to move to make it honest.

### The corner is a fact about the generator, so do not ask and do not assume

`planDefaultBox` had the bottom-right corner written into it, because the clips
it was built for sign there. The first version of this tab changed that constant
to bottom-left, added a corner control, and shipped. Both halves of that were
wrong.

**The constant was wrong** because there is no right value for it. Gemini has
signed in more than one corner across its versions, Veo signs bottom-right, and
an image cropped or rotated since is signed wherever it ended up. Whichever
corner is written down, somebody gets `mark_not_found` on a picture that plainly
has a mark in it — a refusal that is perfectly true about the box and useless
about the file.

**The control was wrong** because it asked the reader for something the tool can
measure. All four corners are now searched on the pick — `scanGeminiCorners` —
and the strongest wins. The control stays, for the run that got it wrong, and it
re-runs on change rather than waiting to be told twice.

Measured on the module's own fixture: a planted mark peaks between 105 and 142
against the same picture's loudest empty corner at 52. **The winner is the
strongest corner rather than the first one over a threshold**, because a floor
tuned to that margin would sit on top of a real mark — the clip half measured the
real thing at about a third opacity, not the fixture's nine tenths. What that
buys is a search that cannot pick the wrong corner when there is a mark, and the
price, stated in the article rather than hidden, is that a picture with no mark
gets its brightest corner named.

The knock-on is worth noting: the resize handle sits on the corner _opposite_ the
pinned one, and which way a drag means "grow" follows from the same fact. A
handle hard-coded to the top-left shrank the box when it was dragged outward on
three of the four corners.

### A tool that knows where to look should not have a Remove button as step one

The first version was a five-step interaction: pick, look at the box, drag it,
press Remove, wait. Four of those five steps existed because the tool declined to
use what it already knew. It has the pixels the moment the file is chosen and it
can find the mark in them, so the run starts on the pick and the answer says
which corner it landed in.

Every control below the picture is now a _correction_ rather than a step, and
each one re-runs immediately — moving the box, naming the corner, flipping the
whole-box switch. **A control that requires a second press to take effect is a
step the reader has to remember; a control that re-runs is a control.** The
Remove button stays for the case where none of them changed anything.

### What averaging was buying

Part two's detector works because footage moves and a mark does not: average two
dozen moments and everything except the mark washes out. A still has one moment,
so that estimate has to come from somewhere else — and the somewhere else was
already there. `fitSmoothBackground` recovers the picture under the mark from the
ring of untouched pixels around it, and the clip half runs it _on the average_.
The still half runs the identical fit on the only sample there is.

Measured on a synthetic still — a four-pointed star with its glow, at 0.88 core
opacity, over a gradient with grain, in `tests/gemini-image.test.ts` — the mark
costs 20.8 levels of mean absolute error and the un-blend gives back all but
**0.85 of them**. Under one level, which is to say inside the grain.

That number is about a background the fit can follow. On foliage, a crowd or text
the fit has real error in it and the division by `1 − a` magnifies it, which is
what the cross-fade to a rebuilt fill exists for and why the whole-box switch
stays within reach. **State which case a measurement came from**; a single number
for "how good is it" would be a claim about the fixture rather than about the
tool.

### One sample and a thousand differ in the loop, not in the arithmetic

Everything between "here is the mark" and "here is what to do to a rectangle of
pixels" is the same for both halves: cut the work rect down from the search box,
crop the three maps to it, size the relaxation to the hole. That was written
inside `cleanVideo`, where a second caller could not reach it, and copying it
would have meant two places to keep a `halo` in step with a `touched`.

It is now `domain/repaint-plan.ts` — `planRepaint` and `applyRepaint` — and the
clip half calls it once per clip while the still half calls it once per picture.
**The thing to lift was the plan, not the loop.**

### A still comes back as PNG, whatever it arrived as

Re-encoding a JPEG to change one corner of it puts the _whole_ picture through a
second lossy pass. The tab promises that every pixel outside the repainted
rectangle is the one the reader handed over, and only a lossless container can
keep that promise. The test asserts it directly: after a run, every byte outside
the reported rectangle is compared against the input and the count of differences
must be zero.

### A complete catalogue is not a delivered catalogue

The Gemini tab shipped with all 60-odd of its strings in `en.json` and `bn.json`,
key-for-key, ICU-valid, with `tsc` green — `global.d.ts` types `Messages` from
`en.json`, so every literal key was checked — and `bun test` green. It then threw
`MISSING_MESSAGE: Could not resolve watermarkRemover.gemini` the first time a
browser rendered the panel.

`src/app/layout.tsx` hands the client provider a **hand-picked slice** of the
catalogue, and three namespaces were not in it. Every check the project runs is
blind to that: the slice is a plain object literal, so the type checker sees an
object, and the catalogue is complete, so parity passes.

**A namespace exists for a client component only once it is in the layout's
slice.** The module now asserts it —
`tests/client-messages.test.ts`, over the scan lifted into
`tools/tests/client-message-slice.ts` when this became the second occurrence.

### The box editor was a video editor, and only by accident

`WatermarkBoxEditor` held a `<video>`, a scrubber, and `SourceVideoFacts`. None of
the box arithmetic cared. The media is now a child, the sizing is a `PixelSize`,
and the clip's player and slider live in `VideoBoxEditor` on top of it —
`components/video-box-editor.tsx`. **A component named after the thing it
contains is usually holding two things.**

---

## Related

- [`../patterns/outbound-requests.md`](../patterns/outbound-requests.md#part-two-a-service-we-own)
- [`../design-system.md`](../design-system.md#tokens)
- [`image-codecs.md`](image-codecs.md) — the shared image layer this decodes
  through.
- [`../hydration-and-platform-pitfalls.md`](../hydration-and-platform-pitfalls.md)
  — why the WebCodecs probe sits behind `useIsHydrated`.
