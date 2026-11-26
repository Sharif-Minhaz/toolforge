# Photo EXIF

`src/modules/photo-exif/` — every metadata tag in a photo, what in it
identifies somebody, and a copy without it that keeps every pixel.

Read it before touching `domain/jpeg.ts`, `domain/png.ts`, `domain/webp.ts` or
`domain/read.ts`.

---

## The stripper never decodes the picture

Every stripper that goes through a canvas re-encodes the JPEG, and every
re-encode loses detail. This one splits the container into its blocks — JPEG
marker segments and scans, PNG chunks, RIFF chunks — drops the metadata blocks
and concatenates the rest. The scan data is copied byte for byte.

That claim is checked, not assumed:

- `tests/strip.test.ts` asserts the JPEG SOS-to-EOI range and every PNG `IDAT`
  are identical before and after.
- Cross-checked against ImageMagick: `compare -metric AE` reports 0 differing
  pixels for all three formats, and stripping with both keep-switches off
  produces a JPEG the exact size of the same picture saved clean by Pillow.
- ImageMagick does not read PNG `eXIf` at all, original included. Pillow was
  used for that chunk instead: it reads back `{274: 6}` and nothing else, with
  every CRC valid.

## An allowlist, not a blocklist

Each walker names the blocks that are *the picture* and treats everything else
as metadata. A blocklist of EXIF/XMP/IPTC misses exactly what matters: a
maker's APP3, a JFXX thumbnail of the uncropped original, an MPF APP2 whose
second image is a full-size copy, bytes after EOI where some phones keep a
motion-photo video. JPEG keeps JFIF, the ICC profile (switchable) and Adobe's
APP14 — without it a CMYK JPEG decodes in the wrong colours. PNG keeps critical
chunks and the colour/animation ancillaries. WebP keeps VP8X, ICCP, ANIM, ANMF,
ALPH, VP8 and VP8L, and rewrites the VP8X flags and the RIFF size to match.

## Orientation is the one tag written back

A phone stores a portrait photo sideways with orientation 6. Strip that and it
opens rotated, which readers report as the tool breaking their photo. So by
default the stripper writes a 26-byte TIFF holding only tag 0x0112 — read
synchronously by `readOrientation`, never through the async parser, so
stripping stays a pure function.

## The parser cannot read WebP, so WebP is re-wrapped

`exifr` reads JPEG, PNG, HEIC, AVIF and TIFF. Rather than a second parser,
`blocksAsJpeg` re-wraps a WebP's EXIF, XMP and ICC chunks as the APP1/APP2
segments of a JPEG with no picture in it, and hands that over. The parser only
reads segments, so the missing image does not matter. `exifr` also does not
report JPEG `COM` segments; the JPEG walker reads those itself.

Values are requested raw — `reviveValues: false` — so a camera's zone-less
`2024:05:01 14:30:15` is never turned into a `Date` that invents a zone. It is
shown as written, with `OffsetTimeOriginal` beside it when the camera recorded
one.

## HEIC, AVIF and TIFF are read but refused for stripping

ISO-BMFF keeps metadata in items whose byte offsets live in `iloc`; removing
one means rewriting every offset after it. TIFF *is* the metadata format. A
wrong offset is a file that will not open, so the stripper refuses by name
(`unsupported_format` with the format attached) and the page says so above the
button.

## The clean copy is read back before it is offered

`CleanCopy` runs the reader over the stripped bytes and disables the download
if any privacy finding survives. It never should; if it ever does, the reader
sees it rather than sharing a file the tool called clean.
