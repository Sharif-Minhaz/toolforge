# Text to Speech

`src/modules/text-to-speech/` — speaking text with a service that was never
offered to us, and reading eight document formats without uploading any of them.

The rate-limiting doctrine it inherits is in [`../security.md`](../security.md);
why an upstream's per-address patience becomes a per-deployment limit is in
[`../patterns/outbound-requests.md`](../patterns/outbound-requests.md#part-two-a-service-we-own).
This file is what is specific to the module.

---

## The service is not an API

The voices are the ones behind Microsoft Edge's Read Aloud. Edge reaches them over
a WebSocket at `speech.platform.bing.com`, with a fixed client token, a
time-derived `Sec-MS-GEC` value and a `chrome-extension://` `Origin`. None of it
is documented and none of it is offered to other sites.

The reference client is Python's `edge-tts`. Its history is the whole risk
assessment:

| When       | What broke                                                      |
| ---------- | --------------------------------------------------------------- |
| 2024-10-25 | `403` on the handshake                                          |
| 2024-11-08 | `Sec-MS-GEC` token required                                     |
| 2025-08-28 | Endpoint moved                                                  |
| 2025-12-11 | `NoAudioReceived`; a `muid` cookie required                     |
| 2026-10-13 | `Sec-MS-GEC` v2: a SHA-256 with altered constants, deliberately |

That is five breaks in two years. A client written for this repository against
the November 2024 scheme was tried on 2026-10-16 and failed on the handshake,
three days after the last change. Hence **depend, don't implement**, against
decision tree 45's usual answer for output only this site reads: the protocol is
not the hard part, keeping up with a counterparty who changes it on purpose is.

Four Node clients were run against the live service the same day:

| Package               | Result                                                     |
| --------------------- | ---------------------------------------------------------- |
| `msedge-tts` 2.1.0    | Works. MIT. Streams. Connection and idle deadlines. Chosen |
| `@andresaya/edge-tts` | Works, but GPL-3.0 — incompatible with this MIT repository |
| `node-edge-tts`       | Works, but writes only to a file path on disk              |
| `edge-tts-universal`  | Hung                                                       |

`msedge-tts` had shipped six releases in the previous six months, the last on the
day after the v2 change. That release cadence is what is being bought.

**When it breaks again**, `repository/edge-speech.ts` sorts a handshake `401`,
`403` or `429` into `upstream_refused`, and the page says the tool needs an
update rather than "try again". The fix is a dependency bump. Check the
`msedge-tts` changelog first, then `edge-tts`'s `drm.py` and `constants.py`.

The page discloses all of this: in the article's limits section, and in the
refusal itself.

---

## It has to run on the server

A browser cannot set `Origin` on a WebSocket, and the service checks it. So the
text goes through `POST /api/text-to-speech`, and rule 32's disclosure sits above
both tabs. The route is a Route Handler, not a Server Action, because the answer
streams: five thousand characters take over a minute to speak.

### Measured on 2026-10-16

| Input                                               | SSML bytes | Audio |          Synthesis time |
| --------------------------------------------------- | ---------: | ----: | ----------------------: |
| 1,300 Bangla characters                             |      3,406 |  1:45 |                     8 s |
| 2,600 Bangla characters                             |      6,810 |  3:30 |                    21 s |
| 5,000 Bangla characters                             |     13,096 |  6:44 |                    72 s |
| 10,000 Bangla characters, in 7 pieces of up to 4 KB |          — | 15:00 | 122 s (11–32 s a piece) |
| A short English sentence                            |          — | 1.9 s |             about 1–2 s |

Those numbers set `MAX_SPEECH_CHARACTERS` at 10,000 and the route's `maxDuration`
at 300 seconds. The slowest piece times the number of pieces is about 224 s, so
the two have to move together.

**Measure with text that does not repeat.** A first 10,000-character run built
from one repeated sentence finished in 54 s, with some 1,500-character pieces
back in 1.4 s. The service evidently caches identical input, so a repeated
fixture measures the cache rather than the voice.

- **The service accepted 13 KB in one request.** `MAX_CHUNK_BYTES` is still
  4,096, the reference client's figure, measured on the _escaped_ text.
- **The first connection from a cold process took 5–15 s on the development
  machine.** It was a 5-second DNS stall in the local resolver, not the service:
  `curl` showed `time_namelookup` 5.0 s cold and 0.0006 s warm. Do not tune
  timeouts against it.

### The response is framed, not bare MP3

A streamed response sends its status before its first byte. If the service
refuses the fourth piece of five, three pieces have already gone out under a
`200`. As bare `audio/mpeg`, the reader would then download a file that stops
mid-sentence and looks finished.

`domain/frames.ts` interleaves audio with progress, and ends with `done` or a
named failure. A body that ends without `done` is `interrupted`, never a file.
The reader is incremental and is tested at every chunk size from 1 to 11 bytes,
because network chunk boundaries fall mid-header as often as not.

### The reader leaving stops the work

The request's `abort` and the body's `cancel` both close the session. A sixty-
second generation nobody is waiting for would otherwise keep spending the
service's patience. Enqueueing to a cancelled body throws, so every write after
that point is dropped.

---

## Pauses cannot be asked for

The service accepts only the SSML Edge sends: one `<voice>`, one `<prosody>`,
plain text. A `<break time="3s"/>` inside it gets **no audio at all**: the turn
ends empty. Escaping the tag instead makes the voice read it aloud ("break time
equals three s"). So `[pause 2s]` markers split the text, each piece is spoken
separately, and the server writes the silence itself.

### Why splicing is safe here

`audio-24khz-48kbitrate-mono-mp3` was measured, not assumed:

- MPEG-2 Layer III, header `FF F3 64 C4`.
- 151 frames of exactly 144 bytes (`72 × 48000 / 24000`, so padding is never
  set).
- No ID3 tag, no Xing or Info frame. The "LAME" string in the first frame is
  ancillary data in an ordinary audio frame.
- ffprobe agreed with `frames × 0.024 s` to the millisecond.

With no header frame claiming a duration, the file's length is its duration.
Each response starts with `main_data_begin = 0`, so no frame reaches back into the
previous piece's bit reservoir. The silent frame is the same header followed by
140 zero bytes. ffmpeg decodes a run of them to samples that are all `00`
(−91 dB, its floor), and a spliced file decodes with no errors.

### What a marker actually adds

Every piece the service returns has about 0.15 s of lead-in and 0.85–1.1 s of
tail, and short pieces are padded to 1.872 s. Inside one piece, the gap between
two sentences measured 0.96 s. So a cut between pieces sounds like a sentence
break, and a marker adds its seconds **on top of** that. `[pause 2s]` after a
full stop measured 3.24 s of silence.

The article says so. Trimming the service's padding would need an MP3 decoder on
the server, which nothing else here needs.

Prosody does reach the service through `msedge-tts`: the same 70-character
sentence measured 4.70 s at `+0%`, 3.17 s at `+50%` and 9.36 s at `−50%`.

---

## Reading documents without uploading them

Everything in `domain/extract.ts` runs in the tab. **The bytes decide the format,
not the name**: a `.doc` renamed `.docx` is read as a compound file. The three
heavy readers are imported on demand.

| Format                  | Reader                                             | Why that one                                                                                                 |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `.pdf`                  | `unpdf` (PDF.js, serverless build)                 | No worker URL to configure under Turbopack                                                                   |
| `.xlsx`, `.xls`, `.ods` | SheetJS 0.20.3, from `cdn.sheetjs.com`             | The npm registry's `xlsx` stopped at 0.18.5, which carries CVE-2023-30533 and CVE-2024-22363                 |
| `.docx`                 | Mammoth, as HTML                                   | Raw-text mode drops `<w:br/>` and runs "Line one" into "Line two"                                            |
| `.odt`                  | `tools/domain/xml-package.ts`                      | Already here for the PDF Converter's Open XML readers. Lifted into `tools/` for this                         |
| `.doc`                  | `domain/compound-file.ts` + `word-binary.ts`, ours | SheetJS's compound-file reader is exported as `any`. The format is small, fully specified and read-only here |
| `.txt`                  | `TextDecoder`, by byte-order mark                  | —                                                                                                            |

### The cross-checks that were not us

LibreOffice wrote one HTML document as `.doc`, `.docx`, `.odt` and `.pdf`, and a
CSV as `.xls`, `.xlsx` and `.ods`. That gives two independent references:

- **The compound-file reader against SheetJS's.** Every stream in the root
  storage of both the `.doc` and the `.xls` was byte-identical, from the mini
  stream (under 4,096 bytes) and from ordinary sectors.
- **The `.doc` text against LibreOffice's own `--convert-to txt`.** Line for line,
  Bangla included. The only difference is blank lines at table-row ends, which
  `tidyExtractedText` collapses.

`.docx`, `.odt` and `.doc` then produce identical text for the same document.
`bun test` uses fixtures built byte by byte in `tests/fixtures.ts`, a compound-file
writer and a Word 97 builder, so that cases like fast-saved piece order, a
property run ahead of the piece table, nested fields and a looping sector chain
can each be built on purpose.

### PDF and complex scripts

A PDF stores glyphs and positions, and PDF.js reconstructs text from them. For
Latin text that round-trips. For Bangla it did not: `ভালো আছেন আপনি?` came out as
`ভা লো আলো ন আপনিন?`, with reordered vowel signs and dropped conjuncts. This is
a property of the file, not the reader, so it is not fixable here. After every
PDF extraction the box says to read the text over.

Under Node, PDF.js also leaked `\u0002`, `\u0004` and `\u0006` glyph markers into
the text. `tidyExtractedText` strips control characters for that reason.

---

## Translate, from the reader's browser

The Translate button sends the box to Google Translate's free web endpoint,
`translate.googleapis.com/translate_a/single?client=gtx`. That endpoint is
undocumented and limited per caller address. Everything below was learned
against the live service.

### The development network was blocked before the first request

From the development machine, every `gtx` call answered **429** with Google's
"unusual traffic" page, while `translate.google.com` itself answered 200. The
block was already in place, which is common on networks where many customers
share one public address. The three verifying calls were made from a phone on
mobile data. Their answers are now the fixtures in `tests/translation.test.ts`,
verbatim.

That is also why the call is **browser-direct**. Through this server, every
reader would share one datacenter address, the kind Google blocks first, and a
block would end translation for everybody. From the browser, each reader spends
their own allowance, and a block affects only them. The refusal is named:
`blocked` for a 429 or 403, and `unreachable` for a `fetch` that throws.

### What the live answers showed

- `[0]` is a list of segments, each `[translated, original, …]`; `[2]` is the
  detected language.
- Line breaks survive, inside the segment they end.
- **Markers do not.** `[pause 2s]` came back as `[বিরাম 2s]`, which is no longer a
  marker. `planTranslation` cuts at every marker with `splitAtPauseMarkers` and
  sends only the runs between, holding back each run's leading and trailing
  whitespace and putting it back afterwards.

### Request size

The calls were verified over `GET`, so each request is bounded by its
URL-encoded `q`: `MAX_TRANSLATE_QUERY` is 6,000, which keeps the URL under 8 KB.
A Bangla letter is nine encoded characters, so 10,000 Bangla characters take
about 15 sequential requests. They are deliberately not parallel, because a burst
is the traffic shape the limiter watches for.

### Not yet verified

Whether `gtx` answers a cross-origin `fetch` with CORS headers could not be
tested: a phone browser opening a URL is not a cross-origin request. If it does
not, every press reports `unreachable`, and the fallback is a server action with
its own fail-closed quota.

### `google-translate-api` (npm) was rejected

It was evaluated on 2026-10-17 and is not a working alternative:

- The last release was June 2017.
- It scrapes a `TKK=` value from translate.google.com, which the page no longer
  contains; the `client=t` endpoint then answers 403.
- It `eval`s the scraped text and parses every response with `safe-eval`, which
  carries six advisories, five critical.
- It depends on `google-translate-token` pinned to `latest`.

## Smaller traps

- **The voice list is frozen** in `domain/voice-catalog.ts`: 322 voices, 142
  locales and 75 languages on 2026-10-16. Rule 6 is the reason: a list fetched
  at runtime is a capability probe. To refresh it, `GET` the `voices/list`
  endpoint in the file's header and regenerate `ShortName`, `Locale`, `Gender`
  and `LocaleName`. A withdrawn voice is refused as `voice_unavailable`, because
  the service answers a dead voice with an empty turn rather than an error.
- **Punctuation-only pieces return zero bytes.** `"..."` and `"?"` are normal and
  not a failure. Only a generation in which _every_ piece was silent is.
- **`msedge-tts` cannot infer a locale from `iu-Cans-CA-SiqiniqNeural`.** The
  locale is passed explicitly; Inuktitut syllabics and Liaoning Mandarin were
  both spoken live.
- **`Intl.DisplayNames` gives raw codes for a dialect subtag** (`zh-CN-liaoning`).
  The presenter keeps Microsoft's English name for those. Every label is built on
  the server, because Node's and a browser's ICU disagree about Bangla names.
- **The shadcn CLI generated `import { cn } from "cn"`** for `progress` and
  installed an unrelated npm package called `cn`. The file and the package were
  removed; the progress bar is the `role="progressbar"` markup the Watermark
  Remover's video tab already uses.
- **`tsconfig.tsbuildinfo` served a stale type for `en.json`** after the catalogue
  grew, reporting a key that existed as missing. `tsc --incremental false` was
  clean. Deleting the build info fixes it.

---

## MCP

Absent, with the reason in `mcp/tools/index.ts` and on `/mcp`. Every generation
spends the patience of a service that sees this deployment as one caller. The
page shares that patience between readers with a Turnstile challenge and an
hourly ceiling; a single token-holding caller with a loop would spend the whole
hour.
