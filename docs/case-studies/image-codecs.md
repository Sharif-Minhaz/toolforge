# Image Codecs and the Batch Queue

`tools/domain/image-codec.ts` plus `src/modules/image-compressor/` and
`src/modules/image-converter/`.

---

## When the platform's own encoder is not good enough

`canvas.toBlob` writes a JPEG. It is also the browser's default writer with one
knob, no way to ask for trellis quantisation, progressive scans, sharp YUV, or
anything else a real encoder exposes — and `drawImage` at a smaller size is
whatever the GPU driver does, which on a large reduction is a box filter.

`tools/domain/image-codec.ts` is the shape to copy when the platform API is
present but the output is the product: **reach for the actual codec, compiled to
WebAssembly.** It lives in `tools/` rather than in either image tool because both
of them drive the same four encoders, and two copies of the trap notes below is
one copy too many.

### The jSquash traps

- **Import each codec on demand, inside the function that uses it.**
  `await import("@jsquash/avif/encode")` means a reader who only ever writes WebP
  never downloads libaom. A static import at the top of `image-codec.ts` would
  pull every encoder into the island's first chunk.

- **The wasm is resolved by the bundler, not by you.** Every jSquash module
  locates its binary with `new URL("x.wasm", import.meta.url)`, which webpack and
  Turbopack both understand as an asset reference. Copying `.wasm` files into
  `public/` and passing `locateFile` is the workaround for a bundler that cannot
  do this; ours can, so do not.

- **Import the single-threaded codec directly, never the package entry point,
  when the package has a multithreaded twin.** This one cost a build.

    `@jsquash/avif/encode` and `@jsquash/oxipng/optimise` choose between a
    single-threaded and a pthread/rayon build _at runtime_, so they import both —
    and `avif_enc_mt.js` and
    `oxipng/codec/pkg-parallel/…/workerHelpers.js` are the only two files in the
    whole dependency that construct a `new Worker`. A worker constructor makes the
    bundler open a nested compilation, and that **deadlocked `next build`**: five
    processes parked in `ep_poll`, zero CPU, zero I/O, forever.

    Neither multithreaded build could ever have run — both are gated on being
    inside a worker, and this runs on the main thread — so
    `@jsquash/avif/codec/enc/avif_enc.js` and
    `@jsquash/oxipng/codec/pkg/squoosh_oxipng.js` give byte-identical output with
    no compilation that hangs. MozJPEG, libwebp and the resizer have no worker and
    are imported normally.

- **A hung build and a slow build look nothing alike — measure before you guess.**
  Expensive bundling pegs CPU. Read `/proc/<pid>/io` twice a few seconds apart: if
  `read_bytes` and `write_bytes` have not moved and nothing new has landed in
  `.next`, it is deadlocked, and no amount of waiting or tuning will finish it.
  Bisect by moving the suspect route out of `src/app/tools/` and building — that is
  a one-minute answer.

- **Copy the bytes out of wasm memory before returning them.** `.buffer` on what a
  codec hands back is the module's whole linear memory, and the next file in the
  batch overwrites it. The package entry points returned that live view;
  `view.slice().buffer` is what makes a queued result still be the image it was
  when it finished.

- **`bun test` cannot reach any of it** — the codecs need `ImageData` and fetch
  their binary by URL. Test the pure layer (`tools/domain/pixels.ts`,
  `tools/domain/filenames.ts`, `tools/domain/archive.ts`, and each tool's own
  `options`/`targets`, `savings`, `ico`, `icon-layout`, `favicon`) and verify the
  codecs in a throwaway Node script that compiles the `.wasm` itself and passes it
  to each package's `init(module)`, then check the output with something that is
  not you: `file`, ImageMagick's `identify`, Pillow. That is the same rule as the
  QR encoder, applied to four formats at once — and it is what proves an option
  profile is _accepted_, not just plausible.

- **Say what the re-encode destroys.** Decoding to pixels drops EXIF, GPS and the
  colour profile, and _applies_ the orientation tag rather than dropping it — skip
  that last step and every phone photograph comes back sideways. All three belong
  in the copy, not only in the code.

---

## The `.ico` container, and the cheapest form of the cross-check

**The independent implementation can be three programs already on the machine.**
Every size combination is written out and read back by `file(1)`, ImageMagick's
`identify` and Pillow — the last of which seeks to each offset the directory
records and decodes what it finds there, which is precisely the round trip a wrong
offset or length would break. A structural assertion written against your own
writer cannot do that.

It also cost two rounds of chasing assertions that were wrong while the file was
right: **when an independent reader disagrees with you, find out what it actually
said before changing the code.**

- `identify` labels an ICO frame by the codec inside it (`PNG 16x16`), not by the
  container.
- `file(1)` describes only the first couple of directory entries and stops.
- Pillow reports a PNG that OxiPNG losslessly reduced from RGBA to
  RGB-plus-`tRNS` as mode `RGB`, which looks exactly like lost transparency until
  you convert and read the alpha extrema.

Three "failures", zero defects.

---

## The batch queue

- **Nothing encodes until the reader asks, and a finished row is finished.**
  Picking files fills the queue and stops there; the batch button is what starts
  work, and it runs **only the rows that have no result yet**. A result already in
  hand is never replaced by a batch press, because dropping a second picture in at
  a different quality is not a request to redo the first one — and on a queue of
  twenty that mistake is twenty encodes the reader did not ask for. Redoing one is
  a per-row button, shown only while that row is stale. `needsWork` in `domain/` is
  that whole rule, and it is unit-tested.

- **Staleness is derived, not stored.** `optionsSignature(options)` is written
  onto a row when its result is produced; a row whose signature no longer matches
  the panel is dimmed and offers "compress again". Nothing is silently re-encoded,
  and there is no `isStale` flag to keep in step.

    What is dimmed is the row, never the summary — every file counted there is one
    the reader keeps, whatever the panel says now.

    Build that signature from **only the options the current target actually
    reads** — the converter's version appends the quality, the size cap and the
    icon sizes each behind its own `…Applies(target)` predicate, so nudging the
    quality slider while PNG is selected cannot dim a row it could not have
    changed. The same predicates disable the control, so there is one answer to
    "does this setting apply", not two that can drift.

- **Work the queue sequentially and say which file you are on.** Running every
  encode at once holds every decoded image in memory simultaneously, which is how
  a tab dies halfway through a batch — four bytes a pixel is the real cost, not the
  file size. Sequential work is also the only way the progress count is true.

- **A row may produce more than one file, and the ZIP layout has to say so.** The
  favicon pack is seven files from one picture. `buildArchivePaths` is the whole
  rule: a row with one output stays at the archive root, a row with several gets a
  folder named after its source, and the flat list then goes through
  `uniqueFilenames`. Flatten it instead and five packs arrive as `favicon.ico`
  through `favicon-5.ico`, which tells nobody which picture each came from. Return
  the pack as its members, never as a nested ZIP — the row's own download button is
  what packs a single reader's copy.

---

## SVG, which is neither a codec nor a grid

`image-converter/domain/svg-source.ts` reads one; `domain/vectorize.ts` writes one.
They are separate problems and only one of them is exact.

### Reading one: the browser is the security model, not a filter

**An SVG referenced as an image is rendered in secure static mode.** No script
runs, no external file is fetched, nothing is interactive — a guarantee from the
platform, and the reason there is no hand-written sanitiser here. That holds for
`<img>`, a CSS background and anything else that consumes the file *as an image*;
it does **not** hold for `<object>`, `<embed>`, an `<iframe>`, or markup parsed
into this page's DOM. So the file only ever becomes a blob URL handed to an
`<img>`, and a change that parses it into the document instead throws that
guarantee away without touching a line that looks security-related.

Two consequences the copy has to carry: an SVG that pulls a bitmap or a webfont
over the network loses it, because blocking that fetch is exactly what the mode
does; and a browser that fetched one anyway taints the canvas, so `getImageData`
throws and the file is reported undecodable rather than half-converted.

**Rewrite the root tag before making the blob — three attributes, for three
different reasons.**

- `width`/`height` are *replaced*, because the image's own intrinsic size is what
  a canvas draw reads. Setting them on the element does nothing.
- `viewBox` is synthesised when the file has none. Without one, a larger `width`
  only makes a larger canvas: the drawing stays the size it was, in the corner.
- `xmlns` is added when missing, because a file without it is not SVG to an XML
  parser and an `<img>` renders it as nothing.

The tag is found by scanning with quote state tracked, not by a regex ending at
the first `>` — a `>` inside an attribute value is legal and cuts the tag in half.

**The size control changes meaning for a vector source, and that is correct.**
For a raster it is a cap that never enlarges; for a vector it is the size to draw
at, because there are no pixels to lose. `svgRenderEdge` is the whole rule: a
raster target asks for the cap, an icon target asks for the largest square it is
about to write — so the 512 in a favicon pack is a fresh rasterisation rather than
an enlargement of the 48.

**The pixel ceiling clamps a vector instead of refusing it.** `width="40000"` is a
number in a text file, not 6 GB somebody already spent. `clampToPixels` floors
both edges — rounding lands back over the budget, which is the one thing it exists
to prevent.

### Writing one: tracing is a re-drawing, and the copy must say so

Quantise (median cut) → despeckle → trace → simplify (Ramer–Douglas–Peucker).
Every step is a pure function over plain arrays, so `bun test` reaches all of them
with no canvas — which is the only reason a boundary-follower this fiddly is
testable at all.

- **Despeckling is not a nicety; it is what makes the target usable.** Without it a
  photograph traces to one path per stray pixel and the file is larger than the
  picture it replaced. The quality slider is wired to the minimum region area and
  the simplification tolerance, which is the same bargain the lossy encoders
  offer in a different currency. Three things about it were only found by
  measuring, and all three are the difference between a usable target and a
  footgun:

    - **A speck must not adopt another speck.** Tallying a region's neighbours by
      *colour* lets two touching specks take each other's value, stranding the one
      merged first once the second merges away. The symptom is unmistakable once
      you look for it: raising the threshold produced *more* regions than lowering
      it — 237 000 at a floor of two against 265 000 at a floor of four. Counting
      by neighbouring **region**, and preferring regions that are themselves
      staying, fixed it (237 000 → 102 000 at the same floor).
    - **One pass is not enough.** Merging changes which regions touch which, so a
      speck with no large neighbour on the first pass usually has one on the
      second. Repeating until nothing moves took a grainy megapixel from 83 000
      regions to 14 500 — and costs a flat drawing nothing, because the first pass
      merges nothing and the loop stops.
    - **The top of the quality range still needs a floor.** With none, quality 100
      on a grainy megapixel produced 794 000 regions and **25 MB** of path data. A
      block smaller than 2×2 is grain or a resampling fringe, never a shape
      somebody drew; refusing it takes that case under 4 MB and leaves a flat
      drawing byte-for-byte identical.

- **Both noise thresholds scale with the grid, and are quoted against a
  megapixel.** "Two pixels" is grain in a photograph and a whole feature in a
  16×16 icon. The speck area scales with area and the simplification tolerance
  with length, which keeps the two in step as the picture shrinks — without it,
  tracing a favicon at low quality merges the entire drawing into one blob.
- **Emit boundary edges with the region always on the same side, then chain
  them.** Holes then come out wound the other way for free, which is what makes
  `fill-rule="evenodd"` correct rather than merely smaller. At a vertex where two
  corners of one region meet diagonally, take the sharpest right turn: it keeps
  the walk on the outline it arrived on instead of producing a figure of eight.
- **Simplification only ever drops points, so every coordinate stays an integer
  grid vertex.** That is why there is no precision setting and nothing to round.
- **Cap the trace grid (1000 px) and say why.** It is not the size control in
  disguise — the output is a vector. A larger grid finds the same shapes plus
  more sensor noise, each speck costing its own outline.
- **An SVG asked for as an SVG is copied through, bytes and all.** Rasterising a
  vector to trace it back into one replaces exact curves with a polygon
  approximation of a rendering of them. The row says `copied`, because silence
  reads as a conversion that did nothing.

### The cross-check, again with programs already on the machine

Same rule as the `.ico` container, three different readers: Python's
`xml.etree.ElementTree` decides whether the output is XML at all, ImageMagick's
`convert` and `identify` decide whether a real renderer draws it and at what size,
and Pillow compares the rendering to the pixels that were traced.

That measurement also settled a design question rather than merely passing:
adjacent traced regions share an edge, and tracers commonly paper over the
resulting hairline seams by stroking each path in its own fill colour. Counting
where the disagreement actually fell — 97.7% of pixels within tolerance, and the
remainder sitting on colour boundaries rather than in flat interiors — showed the
difference was the renderer's antialiasing, not seams. **Measure before adding the
mitigation; a stroke nobody needed would have thickened every thin shape in every
logo.**

---

## Related

- [`blurhash.md`](blurhash.md) — the third image tool, and the reason rendering
  the output matters as much as decoding it.
- [`../architecture.md`](../architecture.md#worked-example-one-the-three-image-tools)
  — why this lives in `tools/`.
- [`../workflow/verification.md`](../workflow/verification.md#diagnosing-a-build-that-never-finishes)
