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

## Related

- [`blurhash.md`](blurhash.md) — the third image tool, and the reason rendering
  the output matters as much as decoding it.
- [`../architecture.md`](../architecture.md#worked-example-one-the-three-image-tools)
  — why this lives in `tools/`.
- [`../workflow/verification.md`](../workflow/verification.md#diagnosing-a-build-that-never-finishes)
