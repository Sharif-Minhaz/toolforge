# Background Remover — A Model That Runs in the Reader's Tab

`src/modules/background-remover/`.

The first tool here that runs a neural network **without a worker, a key or a
per-call cost**. Everything below is something that only shows up once the model
is on the reader's side of the wire rather than ours.

---

## Take the mask, not the cut-out

`@imgly/background-removal` exposes both `removeBackground` and
`segmentForeground`. The obvious one is wrong.

`removeBackground` returns the cut-out **at whatever resolution it was handed**.
So a twelve-megapixel cut-out means handing it a twelve-megapixel image, which
means a 48 MB input tensor, a second 48 MB output tensor and the encoder's buffer
on top — in a phone browser, on top of the model. Hand it something smaller and
the **subject's own pixels** come back smaller. There is no setting that avoids
the trade.

The mask does not have that problem, because **the model computes it at its own
fixed 1024 × 1024 input whatever you give it.** Segmenting a scaled-down copy
loses nothing that was ever going to be computed, and a mask is a smooth,
low-frequency image — scaling it back up is what bilinear filtering is genuinely
good at.

So: segment small, composite large, and apply the mask with one `destination-in`
draw rather than a loop over several million pixels.

```
source (6000 px) ──┬── scaled to 1024 ── model ── mask (1024)
                   │                                  │
                   └───────── drawImage ──────────── destination-in ──► cut-out at 2560 px
```

**Segment at exactly the model's input size, not above it.** This started at
2048 and that was waste, because both of IMG.LY's resizes — down to 1024 × 1024
before inference, and back up afterwards — are bilinear loops *in JavaScript on
the main thread*, four `ndarray.get()` calls per pixel per channel. A 2048-wide
copy bought nothing at the boundary and cost roughly six times the main-thread
work to produce a mask this page immediately rescales again. The downsample now
happens once on the GPU, which is both faster and a better filter.

`toSegmentationInput` and `composeResult` in `domain/canvas.ts`. The fit
arithmetic is `fitWithinEdge` in `tools/domain/pixels.ts` — this module had its
own copy of it for a while, which is rule 40 step one going unread.

This is the same rule the Watermark Remover's case study states as **"send the
smallest thing that answers the question"** — applied with no network anywhere in
the path.

## A canvas is not freed when you drop it

The worst defect this tool shipped. A reader on a 3–4 MB photograph got a frozen
tab for several seconds, then a crashed browser — and twice, a crashed laptop
that logged them out.

Three compounding causes, all memory:

- **Nothing bounded the composite.** It was written at the source's own size, so
  a twelve-megapixel photograph meant two canvases at **48 MB each** — the subject
  with its alpha, and the frame it is drawn onto — on top of the decoded
  original, on top of a WebAssembly heap holding an 84 MB model, times up to five
  open slots. `MAX_COMPOSITE_SIDE` is the fix, and it costs almost nothing real:
  the alpha channel is computed at 1024 whatever happens, so the cut-out *edge*
  has no more detail at 6000 px than at 2560.
- **Dropping the last reference to a canvas does not free it.** It makes it
  *collectable*. One canvas is allocated per redraw — which is one per step of a
  slider drag — so a dozen can be queued for a collector that has not run.
  `releaseCanvas` sets `width = height = 0`, which hands the backing store back
  immediately, and every canvas in this module now goes through it.
- **`ctx.filter` with a large radius across megapixels is seconds of main-thread
  time.** See below.

**Say what the ceiling did.** The result panel names the source's dimensions
whenever the output is smaller, because somebody about to press Download should
not learn that from the file's properties afterwards.

## Blur small, scale up

A blur *is* the destruction of fine detail. There is nothing in the result that a
quarter-size canvas could not carry — so blurring at `MAX_BLUR_RENDER_SIDE` and
letting `drawImage` scale it back is visually the same picture for a fraction of
the work, and it is the difference between an unnoticed redraw and a frozen tab.

The radius scales by the same factor (`scaleFactor` in `compose-geometry.ts`), or
the effect gets weaker as the picture gets bigger — which is the bug this
otherwise-free optimisation invites.

## A blur at the edge of a canvas samples nothing

`ctx.filter = "blur(Npx)"` averages each pixel against its neighbours. At the
frame's edge, half those neighbours are outside the canvas, which is transparent
— so the average pulls toward transparent and **a pale border appears around the
whole photograph.** It is the single most recognisable way a hand-rolled
portrait-mode effect looks broken.

The fix is to draw the background **grown by twice the radius on every side**
before blurring, so every sample inside the frame lands on real pixels.
`blurredBackgroundRect` does the cover fit and the overscan in one function, and
that is deliberate: doing them as two steps is how you scale the picture up
twice and hand the reader a background cropped to its middle third. The test for
that is written as the invariant — aspect ratio preserved, scaled just far enough
to cover the grown box — rather than as a magic number.

## Three sizes of the same model, and the number has to be true

The weights are 42 MB, 84 MB or 168 MB, plus 11 MB or 23 MB of runtime. That is
shown to the reader **before** they commit to it, which makes it copy that must
be right rather than a comment.

So the byte counts in `domain/constants.ts` are read from the published manifest,
not estimated:

```bash
curl -s https://staticimgly.com/@imgly/background-removal-data/<version>/dist/resources.json
```

`MODEL_ASSET_VERSION` records which version they came from. The unit test checks
the *internal* rules — each tier heavier than the last, none zero — and
deliberately does not fetch the manifest, because a test that needs a CDN fails
on an aeroplane rather than when something is wrong.

**Default to `balanced`, not `fast`.** The question somebody opens a background
remover to answer is whether the edge of the hair looks right, and the quantised
model is visibly worse at exactly that.

## Two failure states, not one

`classifyRemovalError` splits "the weights never arrived" from "the model ran and
threw". They read the same to a `catch` and mean opposite things to a reader:
one is answered by trying again on a better connection, the other is not, and
telling somebody on a train to check their connection when the real fault is a
WebGPU driver wastes their afternoon.

It matches on IMG.LY's own sentences, which is a dependency on a string. So
`tests/removal.test.ts` **reads the shipped bundle** and asserts those strings are
still in it — otherwise a version bump that reworded either message would turn
every CDN failure into "the model failed", silently. That is
[`../testing.md`](../testing.md#verifying-against-something-that-is-not-you)
applied to an error message.

## A cross-origin background taints the canvas, and it fails late

A Pexels photograph drawn onto a canvas makes `toBlob` throw `SecurityError`
unless the `<img>` asked for CORS **before it loaded**. The damage is done at
*download* time — long after the reader picked the photograph and watched it
composite on screen.

`loadCorsImage` sets `crossOrigin` through the shared `loadImage` factory, which
assigns `src` last for exactly this reason. Set `crossOrigin` afterwards and the
browser has already started a request without an `Origin` header, so the response
arrives without `Access-Control-Allow-Origin` and the canvas is tainted anyway —
a bug that looks like the CDN being misconfigured.

`images.pexels.com` answers `access-control-allow-origin: *`, which is what makes
a stock background compositable at all. Check that before adding a second source.

## A format with no alpha flattens onto black

`canvas.toBlob(…, "image/jpeg")` does not flatten transparent pixels onto white.
It flattens them onto **black**, because that is what a transparent pixel is once
the channel is dropped — and a JPEG of somebody's cut-out portrait comes back on
a black rectangle.

`composeResult` paints white first whenever the chosen format cannot carry alpha,
*before* the background rather than instead of it, so a partially transparent
background lands on white too.

The picker stays enabled for the combination that loses transparency, with a
warning beside it. Choosing JPEG for a cut-out is a legitimate thing to want — a
great deal of e-commerce software expects it — and a control you cannot press and
are left to guess about is worse than one you were warned about.

## A stock library's front page is portraits

`/v1/curated` is whatever Pexels' editors are featuring, and that is people more
often than not — which is the one subject that is never a useful *background* for
a photograph of somebody. The obvious default endpoint was the wrong one.

There is no `-people` operator in the Pexels API, so the fix is two blunt
instruments and an honest sentence in the copy:

- **Seed the search with places.** Fourteen chips, each searching *several* place
  words — `forest trees woodland path`, not `forest`. A bare noun returns a great
  deal of somebody walking through the thing rather than the thing. The terms
  live in `domain/backdrop-topics.ts` and are sent as a **key**, not as their
  text, so a caller that skips the picker cannot drop the bias by omitting it.
  `resolveSearchTerm` can never return the empty string, which is the property
  that makes that guarantee hold.
- **Drop what describes a person.** `hidesPeople` reads Pexels' `alt` against a
  word list. Word-bounded, not substring: `man` is inside **man**or, hu**man** and
  Ro**man**ia, and `kid` is inside s**kid**. It reads the raw `alt` rather than
  `describePhoto`, which falls back to the *photographer's name* — and a
  photographer called "Man Ray" is not a picture of a man.

**An empty `alt` is kept, not dropped.** Nothing is known about that photograph,
and discarding every undescribed picture would empty most pages. A stray tile
costs less than a good background nobody ever sees. Say that in the article
rather than claiming a filter.

**Over-fetch so the filter is invisible.** Pexels meters *requests*, not
photographs, so asking for 48 and keeping 24 costs exactly what asking for 24
would. Without the headroom a page thins to a half-empty grid and the reader
reads that as a bad search rather than as the filter working. `hasMore` still
comes from Pexels' own `next_page` — a page that filtered down to three tiles is
not the end of the results.

## A hidden tab panel unmounts, and takes its results with it

Base UI's `Tabs.Panel` defaults to `keepMounted: false`. Switching to Colour and
back therefore destroyed the Photo tab's fetched grid, its scroll position and
its typed query — and remounting refired the search, spending the shared Pexels
allowance again to redraw the same thing.

`keepMounted` on all three panels, not just the one that fetches: the Colour
tab's half-typed hex draft was resetting for exactly the same reason, and one
rule beats one per panel. This is the same defaulting that
`references/pitfalls.md` records for `Accordion` and find-in-page, applied to
state instead of text.

A bounded module-level `Map` of results sits behind that for the cases
`keepMounted` cannot reach — a reader who tries `forest`, then `lake`, then goes
back. It holds only what an upstream already answered, which cannot go stale
within a session.

## Pexels meters the key, not the caller

The same trap the Watermark Remover records, in a different shape. Pexels'
allowance belongs to **this deployment's API key**, so every visitor's search is
charged against one shared pool.

That makes the deployment-wide counter the important one, not the per-address
one — `image:stock` in `repository/photo-quota.ts` keys its second counter on a
literal, deliberately, so it cannot later be misread as "per host" the way the
picture importer's is. And **the copy never describes the limit as per visitor**,
because it is not.

It fails closed. An unmetered search box is a scriptable way to exhaust a shared
credential and take the picker away from everybody else until the hour turns
over.

## `z.url()` accepts `javascript:`

Every URL in a Pexels response ends up as an `href` on a credit link or a `src`
on an `<img>`. `z.url()` validates with the URL parser, which is perfectly happy
with `javascript:alert(1)`.

`z.url({ protocol: /^https$/ })` is the whole fix. Plain `http` is excluded too:
a mixed-content image simply fails to load, and a credit link that downgrades the
connection is not worth rendering.

## Five slots, one at a time

Each slot holds a decoded bitmap — four bytes a pixel, so a twelve-megapixel
photograph is 48 MB before anything is drawn. Five open at once is comfortable;
five *running* at once is how a tab is killed halfway through.

So there is no batch button and no apply-to-all. The button belongs to the open
slot, and `domain/sheets.ts` holds the whole of the strip's behaviour as
arithmetic over a list — which slot is selected after a close, how many of an
eight-file drop fit — because those are exactly the parts that go quietly wrong
and never show up in a screenshot.

## Not exposed over MCP, for two reasons

It needs a canvas, like every other image tool. It also fetches a
hundred-megabyte model **into the reader's browser and caches it there** — running
it server-side would move that download and the inference behind it onto this
deployment for every call. The tool is local precisely so that cost is not ours.
Recorded in the comment block at the top of `src/modules/mcp/tools/index.ts` and
in the `/mcp` guide's copy, rather than left out quietly.

---

## Related

- [`watermark-remover.md`](watermark-remover.md) — the other tool that repaints a
  photograph, and the origin of both the payload rule and the shared-limit trap.
- [`image-codecs.md`](image-codecs.md) — the batch-queue doctrine this arrived at
  from the other direction.
- [`../patterns/outbound-requests.md`](../patterns/outbound-requests.md) — why
  plain `fetch` is right for Pexels and wrong for a host the reader named.
- [`../security.md`](../security.md#decide-which-way-a-gate-fails)
