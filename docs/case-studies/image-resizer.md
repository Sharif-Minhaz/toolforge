# The Resizer, and Getting a Picture Into a Tool

`src/modules/image-resizer/`, plus the shared intake in `tools/` that six tools
now use: `domain/pasted-image.ts`, `domain/remote-image.ts`,
`components/image-source-controls.tsx`, `repository/remote-image.ts`.

---

## A claim about pixels that nobody can check is not a feature

"Crop without losing quality" is the request. It is also the one thing about
this tool that is either true or not, and the difference is invisible in a
screenshot — which is exactly why it had to be provable in `bun test` rather
than demonstrated in a preview.

So the crop is **not** `drawImage` with a source rectangle. It is
`cropPixels` in `domain/compose.ts`, a row-wise `TypedArray.set`:

```ts
const from = ((y + row) * source.width + x) * 4;
data.set(source.data.subarray(from, from + rowBytes), row * rowBytes);
```

Byte _n_ of the output is byte _n_ of the input, offset. A test asserts that
directly — pixel by pixel against the source — which is a thing a canvas call
cannot promise, because a driver is free to resample a scaled blit however it
likes.

The same reasoning put the whole geometry in `domain/plan.ts` before any pixel
moves. `planRender` answers every question the renderer could ask — how big the
file is, where the picture sits on it, whether anything is being scaled at all —
from three inputs and nothing else, so `bun test` can assert that a 45 × 55 mm
passport photo at 600 DPI is 1063 × 1299 and that a landscape photograph inside
it is letterboxed rather than cropped, with no `ImageData` anywhere.

**`resamples: false` is the promise, made checkable.** The renderer skips the
resampler entirely when it holds, the panel says "pixels copied — nothing was
resampled", and `copiesPixels` is what both read. The copy in the article then
separates the two losses people conflate: the crop costs nothing, and the
_encoder_ still costs whatever the format costs.

## Unpremultiplied source-over is not `src·a + dst·(1−a)`

That form is correct only over an opaque destination. Over a transparent canvas
it drags every translucent pixel toward zero — a 50% grey lands as a 50%
_black_ — and the mistake is invisible until somebody opens the PNG on a light
background. The general form divides by the resulting alpha:

```
outA = sa + da·(1−sa)
out  = (src·sa + dst·da·(1−sa)) / outA
```

Written the wrong way first, caught by the one test that composited onto no
matte. Over a matte both forms agree, which is why the other five tests passed.

## The passport photograph is a print, not an image

A 45 × 55 mm photograph at 300 DPI is 531 × 650 pixels, and pixels are all a
file normally carries. Every program that prints it then guesses, and most guess
72 — which puts that photograph on paper at 188 × 229 mm. Right pixels, wrong
print, discovered at the counter.

Two consequences, and both are structural rather than cosmetic:

- **Document sizes are stored in millimetres**, with the resolution the issuing
  authority prints at (`PresetSize`, `kind: "physical"`). Storing them as pixels
  bakes in one DPI and hands somebody printing at 600 a photograph half the size
  their form allows. A Facebook cover is genuinely 820 × 312 pixels and is
  stored that way; the two kinds are a union, not a convention.
- **The resolution is written into the file.** `domain/density.ts` inserts a
  `pHYs` chunk into a PNG and sets the JFIF density on a JPEG. WebP and AVIF have
  nowhere to put one, so the switch goes dead for those two rather than
  pretending.

Both writers are byte surgery on an encoded file, which is precisely the case for
[verifying against something that is not you](../testing.md#verifying-against-something-that-is-not-you).
`identify -units PixelsPerInch`, `file(1)` and Pillow all read 300 and 600 back
out of both formats. Pillow reports a PNG as `299.9994` because `pHYs` counts
whole pixels per _metre_ — that is the format, not a defect, and it is the kind
of thing an independent reader tells you and a self-written assertion does not.

Neither writer assumes an offset. `pHYs` is inserted by walking the chunk list to
the first `IDAT`, because a decoder may ignore one it meets afterwards; the JFIF
patch walks the segment list and stops at `SOS`, because after that `FF E0` is
entropy-coded data rather than a marker. Both hand the file back untouched when
they do not recognise it — a writer that corrupts a file it misread is a far
worse bug than one that quietly does nothing.

## Clamp the shape, not the axes

The fiddliest thing in the tool is a ratio-locked corner drag that runs into the
edge of the picture. The obvious implementation clamps each axis to the bounds
independently. It satisfies the boundary and **quietly abandons the ratio**, at
the exact moment the reader was relying on it.

`buildRect` in `domain/crop.ts` is the fix and it is one shape: express the drag
as an anchor per axis (`start`, `end` or `center`), compute the room each anchor
has, then scale both sides by a **single** factor — up first so neither side is
under the minimum, down second so neither leaves the picture. Every handle,
every ratio, both directions, one function. The test that would have caught the
axis-wise version asserts `width === height` after dragging a square crop off
the bottom-right corner.

Two smaller rules fell out of building it:

- **Take the pointer's position, not a delta.** Deltas accumulate drift, and a
  pointer moved out of the window and back leaves the box somewhere the cursor
  is not.
- **Everything is in the source image's pixel space.** The preview is whatever
  width the viewport allows; a crop reasoned about in screen pixels means
  something else after a sidebar collapse. `crop-canvas.tsx` converts once, at
  the edge, and positions the box in percentages so it needs no measurement to
  stay put.

## One frame, two modes, and no result panel

The first version rendered the export into a panel below the workbench and left
the original in the frame above it. Two pictures, and the reader has to decide
which one they are looking at — then discovers that a second crop still applies
to the first.

It is one frame now, and it is in one of two modes:

- **Preview** (the default). The frame shows the *composed output* — the size,
  the padding, the background — redrawn as the controls move.
- **Crop**, which is opt-in. The frame shows the picture itself with a box over
  it, because a box dragged over a letterboxed thumbnail would be selecting a
  region of the preview rather than of the photograph.

Crop being opt-in was a correction. Handles and a scrim over a photograph nobody
has decided to cut yet read as a demand rather than an offer, and they cover the
thing being previewed. The tool opens on a press and closes again on apply or
cancel; cancelling puts the box back to the whole frame so the preview goes on
meaning "the picture as it is".

**Opening it also puts the size settings on hold**, and the reason is the same
one that made the crop tool opt-in. Out of the tool, every control on the right
is answered by the picture in front of the reader. Inside it, the frame is the
source with a box on it, and those same controls would be changing a result
nothing on screen is showing — a slider whose effect is invisible until two
presses later is worse than a slider that is plainly not available yet.

Two details keep that from being merely annoying. The **shape lock and its
custom field stay live**: they sit in the right-hand column but they are crop
controls, and locking them would mean cancelling the crop to choose a ratio and
starting the drag again. And the panel is **not dimmed as a block** — greying a
control that still works is a worse lie than not greying one that does not, so
each locked control carries its own disabled state and a note above them says
what will bring the rest back.

**Applying is an in-place edit**: the frame becomes the cropped picture, the box
resets, and the next crop is taken from that. Which is only safe to offer
because the step reverses, and `history` holds the whole previous `Loaded`
rather than the rectangle that produced it — a rectangle means nothing against a
frame that has since changed shape.

## Derive from a reference, never from the last result

Reported from use: pick 1:1 and the square is right; switch to 4:3 and the box
comes back smaller; keep switching and it shrinks away to nothing.

`applyRatio` **inscribed** the new shape inside the current box. The reasoning
was sound for one switch — going from a free drag to 1:1 should not quietly take
in more of the picture than was selected a moment ago — and catastrophic for the
second, because inscribing is one-way. Each switch was derived from the shape
the previous switch produced, so 1:1 then 4:3 then 1:1 fits a box inside a box
inside a box and ratchets down monotonically.

Two changes, and both were needed:

1. **Preserve area, not containment.** `w = √(area · ratio)`,
   `h = √(area / ratio)` is the only box of that shape covering as much of the
   picture as the last one did. Oversize scales both sides by one factor and then
   **slides** back inside rather than shrinking against the edge — a box near the
   left margin should move right to fit, not get smaller. From a full-frame
   selection it lands exactly on the largest box of the new shape, which is what
   somebody who has not dragged anything yet expects.

2. **Derive every switch from an anchor.** Area alone still leaks whenever a
   shape meets the edge and cannot keep it: 1:1 → 16:9 → 1:1 settled 800 → 750
   and stayed there. Converging beats ratcheting, but it is still visible. So the
   island holds `cropAnchor` — the box the reader last placed *by hand* — and
   every ratio is computed from that. The two 1:1 boxes are computed from the
   same rectangle, so they *are* the same rectangle.

The anchor follows a drag, Select all, Centre, an applied crop and an undo —
every gesture that is the reader saying where the box goes. It deliberately does
not follow a ratio switch, which is the whole point.

The general shape is worth keeping: **a control that transforms its own previous
output accumulates its own rounding and its own clamping.** Give it a stable
reference and recompute, rather than composing the transform with itself.

The old test asserted the inscribing behaviour, so it had to change — that is a
behaviour change rather than a refactor, and the replacement asserts the
round-trip property directly rather than a particular rectangle.

## The live preview is layout, not pixels

The preview has to answer "what will I get" while the reader is still moving the
controls. Doing that with pixels means decoding, scaling and compositing on every
keystroke — hundreds of megabytes of work for a picture nobody downloads.

`domain/preview-geometry.ts` does it with three nested boxes and no pixel work
at all:

```
canvas   aspect-ratio: canvas.width / canvas.height, background = matte
  draw   the scaled crop, positioned as a % of the canvas — may overflow it
         under `cover`, which the canvas clips
    img  the whole picture, blown up so that the *crop* fills the draw box
```

The third box is the one that is not obvious: rather than producing a cropped
image, the `<img>` is scaled to `source / crop` and pulled left and up by
`crop.x / crop.width` — so the draw box shows the crop with no second image and
no canvas.

Every number comes from the same `RenderPlan` the exporter reads. That is the
point: the preview cannot drift from the file, because it is a second *reading*
of one geometry rather than a second copy of it.

A compact copy of it lived under the crop box for one revision, so that settings
changes were visible while cropping too. It came straight back out: the frame is
already the preview everywhere except inside the crop tool, and a second small
picture of the same thing is a thing to look at rather than a thing to read.

What it deliberately cannot show is what the encoder does to the pixels. The
copy says so, and the format picker and quality slider are what that sentence
points at.

Two things fall out of it:

- **The preview blob is the browser's PNG writer, not OxiPNG.** It runs on every
  crop and is thrown away by the next one; nothing is downloaded from it and
  nothing is measured from it. Spending a second of OxiPNG on bytes that exist
  to fill an `<img>` would make the edit feel broken to save nobody anything.
  `pixels` stays the source of truth, so four crops cost four canvas writes and
  the export still runs once, from the pixels, at the quality asked for.
- **The report became a prediction.** With no result panel there is nothing to
  say what happened, so the line under the buttons says what the next press will
  do — the output size, the format, and whether anything will be resampled.
  Better anyway: "the pixels will be copied" is worth reading *before* the press
  it describes.

`Export` is one press, not two. What is in the frame is what is being exported,
and a preview of a picture the reader is already looking at is a step rather
than information.

The buttons sit **under the picture**, inside the crop column, rather than in a
row under the grid. The settings column is roughly twice as tall, so a shared
row at the bottom left the two most-used presses marooned below a column of
empty space, far from the thing they act on. The crop column is also
`lg:sticky` with `self-start` — and `self-start` is the load-bearing half: a
grid item stretches to the row's height by default, which leaves `position:
sticky` nothing to slide against.

## Cap the preview's width, never its height

A phone screenshot is about 9:19.5 and a scrolling capture is far worse. At
`width: 100%` in a workbench column, one of those renders two or three viewports
tall and pushes every control off the bottom — the reader's next action is
invisible from where they are standing. It turned up on the resizer and the
Watermark Remover at the same time, which is how it ended up in `tools/`.

The obvious fix is wrong for **every preview on this site**. `max-height` plus
`object-contain` letterboxes the image inside a container that is now wider than
it — and all four of these previews have something laid over the picture: a crop
box, a paint canvas, a compare slider, an aspect-ratio frame. Those are
positioned against the *container*, so the overlay drifts off the picture and
every pointer coordinate is measured against the wrong box.

`previewFrameMaxWidth` in `tools/domain/preview-frame.ts` caps the **width**
instead, at `aspect × min(520px, 65svh)`. A frame that wide is exactly that tall,
the container still hugs the picture on all four sides, and percentages and
pointer maths keep meaning what they meant. A wide picture gets a ceiling wider
than its column, which is the same as no ceiling.

It returns a CSS `calc(…)` string rather than a number on purpose: `svh` cannot
be resolved here and should not be. Reading the viewport during render is the
hydration bug in
[`../hydration-and-platform-pitfalls.md`](../hydration-and-platform-pitfalls.md);
handing the whole expression to the browser means the server and the client emit
the same style attribute. `svh` rather than `vh` so a mobile browser collapsing
its address bar cannot resize the frame mid-drag.

## Getting a picture in: three doors, one of which is not private

The request that came with the tool was "Ctrl+V should work, and so should a
public link — on the other image tools too". Six tools, so the intake is shared
(`tools/components/image-source-controls.tsx`), and each of the three doors has
a different problem.

**Paste is two clipboards, not one.** A paste _event_ carries
`DataTransferItem`s and needs no permission, because the gesture is the consent.
`navigator.clipboard.read()` carries `ClipboardItem`s and prompts. Both are
offered: the event handles Ctrl+V, and the button handles a reader whose focus
is on a button, or who is on a touch device with no Ctrl+V at all. The listener
is bound to the **window**, because a paste event fires at whatever has focus and
on a fresh page that is the body — and it claims the event only when the
clipboard actually holds a decodable file, so pasting a URL into the field below
it still works normally.

Copying an image out of a web page puts several representations on the clipboard
at once, so the file is rarely first; and Windows offers a PNG and a BMP
together, so the pick is ordered by `DECODABLE_IMAGE_TYPES` rather than by the
clipboard's own order.

**The URL importer cannot be client-side, and that is the whole cost.** A
cross-origin image drawn into a canvas taints it, so `getImageData` throws unless
the host sent `Access-Control-Allow-Origin` — which almost none do. The bytes
therefore come through this server, which makes the feature a server-side request
forgery surface before it is a convenience, and it follows every rule in
[`../patterns/outbound-requests.md`](../patterns/outbound-requests.md): resolve
first and connect to the address that was checked, re-guard every redirect hop,
cap the body while it streams, forward nothing in either direction.

Three details specific to fetching a picture rather than a page:

- **Refuse on the header, not after the download.** A `content-type` outside the
  decodable allowlist ends the response before a byte of body is spent — and an
  HTML error page served with a 200 is the single most common thing behind a
  "broken" image link.
- **A `content-length` is a claim, not a promise.** It is checked when present
  because it is free, and the real ceiling is enforced on the stream.
- **The extension comes from the bytes, never from the path.** A CDN that
  re-encodes on the fly serves `photo.jpg` as `image/png`, and saving those bytes
  as `.jpg` hands the reader a file their own system opens with the wrong
  decoder.

**Three tools changed their runtime label.** The Image Compressor, Image
Converter and Blur Placeholder Generator were `runsOn: "browser"` and are now
`"hybrid"`, and the front page's "sends nothing anywhere" count dropped by
three. That is the honest bookkeeping: the field is on the page whether or not
anybody uses it, and rule 31 puts its disclosure above the controls rather than
in the article. The counter is asserted by name in
`tools/tests/catalog.test.ts`, so a fourth tool growing a network path cannot
slip past it.

**The limiter fails closed and the control disappears with it.** No database or
no `IMAGE_IMPORT_IP_SALT` means no URL field at all, on any of the six — not a
field that errors when pressed. Everything else about every one of those tools
keeps working, because nothing else about them ever touches the network.

## Related

- [`image-codecs.md`](image-codecs.md) — the encoder layer this tool drives, and
  why the codecs are WebAssembly rather than `canvas.toBlob`.
- [`../patterns/outbound-requests.md`](../patterns/outbound-requests.md)
- [`../testing.md`](../testing.md#verifying-against-something-that-is-not-you)
