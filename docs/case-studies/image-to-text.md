# Image to Text — Tesseract in the Reader's Tab

`src/modules/image-to-text/`.

An OCR tool built on `tesseract.js` 7, the same engine the Clipply apps use, and
it keeps what Clipply learned the hard way. The picture never leaves the tab.
The engine and its language data do cross the network, inbound, once.

---

## `createWorker` can hang forever, and only `errorHandler` hears about it

When the WebAssembly core or a `.traineddata` file fails to load (offline, a
blocked CDN, a 404), the promise `createWorker` returns **never settles**. The
error goes to the `errorHandler` option and nowhere else. So `recognize.ts` wraps
worker creation in a promise that `errorHandler` rejects, and wraps the whole run
in `watchStall`. That fails the run once the engine has sent no logger message
for `STALL_MS`.

`STALL_MS` is 120 s, not Clipply's 60 s. Clipply bundles its data; here the
3.9 MB core is downloaded with no progress events in between, which takes about
80 s on a slow mobile connection. A stall is its own refusal (`stalled`),
separate from `engine_unavailable` (loading failed) and `recognition_failed`
(the worker was up and failed while reading).

## English goes second

Every language except English loads as `[language, "eng"]`, so the English
words in a Bangla receipt still come back. The order matters. With English
first, Tesseract reads other scripts as Latin.

Clipply goes further: one pass per candidate language, keeping the result with
the highest confidence. It needs that because nobody tells it what language a
clipboard image is in. A reader here says which language they have, so one pass
is enough and costs a third of the time.

## Chinese and Japanese come back spaced out

Tesseract segments Han and kana as one-letter words, so `这是中文` arrives as
`这 是 中 文`. `tidyRecognizedText` removes whitespace between two CJK characters
and nothing else: a space between `東京` and `Tower` survives. It also drops the
trailing form feed, trailing spaces, CRLF line endings and runs of blank lines.
It never changes a character. The box shows what the engine read.

## Transparent pixels are black to Tesseract

A screenshot with an alpha channel and dark text reads as black on black. The
picture is drawn over a white matte before recognition. That fill is the one raw
colour in the module, and it is a canvas paint colour, not a theme colour. The
same step:

- turns the picture upright using its EXIF orientation (`decodeToDrawable`,
  exported from `tools/domain/image-codec.ts` for this)
- scales it down past `MAX_RECOGNITION_PIXELS` (8.3 MP, a 4K screenshot) instead
  of refusing it

## The download size is copy, so it is measured

The disclosure above the controls names the size of the first download for the
chosen language. The numbers in `domain/constants.ts` come from jsDelivr's
manifest, not from an estimate:

```bash
curl -s "https://data.jsdelivr.com/v1/packages/npm/@tesseract.js-data/<code>@1.0.0?structure=flat"
curl -s "https://data.jsdelivr.com/v1/packages/npm/tesseract.js-core@7.0.0?structure=flat"
```

Upgrading `tesseract.js` or its data packages means reading these again.

## The box is written in the language it was read in

The result `<textarea>` takes `lang` from the language of the **read**, not the
picker, and switches to `dir="rtl"` for Arabic. The Han character `直` is drawn
differently in Simplified, Traditional and Japanese fonts. Without `lang`, a
Japanese read would be shown in a Chinese face.

The box has no ceiling and no meter. Nothing in it is submitted or derived from,
and it starts at whatever one picture held (CLAUDE.md rule 9 is about boxes that
feed something).

## Not on MCP

Tesseract runs in a worker in the reader's browser, with data cached there.
An adapter would move seconds of CPU per picture onto this deployment for every
call, and a model that wants the text in a picture can already read it. The
reason is recorded in `mcp/tools/index.ts` and on `/mcp`.

## What `bun test` cannot reach

The language table, the text tidy-up, progress mapping, the stall watchdog and
the pixel fit are all tested. `recognizeImage` itself (worker, canvas, CDN) is
not: Bun has neither a canvas nor a browser worker. It has to be checked in a
browser, once per language family: Latin, an Indic script, Arabic, CJK.
