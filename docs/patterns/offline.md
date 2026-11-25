# Offline and the installed app

ToolForge installs as a PWA, and once installed every tool that runs in the
browser works with no connection. This page is how that holds together, and
what a new tool has to do to keep it true.

## The pieces

| Piece                                    | Job                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `public/sw.js`                           | The service worker. Hand-written, no build plugin (Serwist needs webpack; this app builds with Turbopack). |
| `scripts/build-sw-manifest.ts`           | Runs after `next build`; writes `public/sw-manifest.js` (gitignored) listing every file the worker keeps.  |
| `src/modules/pwa/domain/precache.ts`     | What goes in that list, unit-tested.                                                                       |
| `src/modules/pwa/components/pwa-runtime` | Registers the worker (production only), toggles `<html data-offline>`, holds the install prompt.           |
| `src/app/[locale]/offline/page.tsx`      | The answer to an offline navigation to a page the worker does not keep.                                    |
| `src/app/manifest.ts`                    | `description` + `screenshots` are what make Chrome show the rich install dialog, not the bare one.         |

## Why the whole build is precached

Caching only what a reader visited is not enough. A tool's lazy `import()`
chunks — an AVIF encoder, a PDF writer — appear in no page's HTML, so a tool
opened offline would render and then fail the moment it reached for its codec.
The build script lists every file under `.next/static` instead, minus what no
offline tool loads (source maps, legacy font formats, ONNX Runtime's Node build
and its 24 MB WebAssembly).

That list is only fetched by an **installed** app ("warm"): `PwaRuntime` asks
on launch in standalone mode and on `appinstalled`, and the worker skips it when
the current build and language are already kept. A casual visitor gets the
offline page and the stylesheets, nothing more. An installed app that warmed the
previous build re-warms during the update's `install`, reusing every hashed
file it already has.

## Pages follow the language cookie

The same URL renders English or Bangla depending on the cookie, so pages are
re-fetched on every warm and the warm records which language it kept. Hashed
assets never are.

## Models are not precached

Weights are 27–176 MB and belong to readers who use those tools. The worker
caches the CDN responses (`staticimgly.com`, `cdn.jsdelivr.net`) the first time
they are used, in a bucket that survives deploys. Image to 3D keeps its depth
model in its own Cache API bucket, so Hugging Face is left alone.

So a model tool offline is one of two states, and the page says which:
**on the device** (it runs) or **not yet downloaded** (the control is disabled
and `<OnlineRequiredNote kind="model">` sits beside it). Never let the run start
and fail with a network error.

"On the device" is asked the cheapest honest way each store allows: the cut-out
tiers from `tools/domain/cutout-memory.ts`, OCR languages from
`image-to-text/domain/language-memory.ts` (both written after a successful
run), and the depth model from its own Cache API bucket (`isDepthModelCached`).
Read the two memories only when `useOnline()` is false — it is never false
during hydration, so the server and first client passes still agree.

## A tool that needs the server

`runsOn: "server"` is the whole contract. `needsNetwork()` reads it, and:

- client lists (the sidebar) filter with `useOnline()`;
- server-rendered lists put `data-needs-network` on the list item, and one rule
  in `globals.css` hides it under `<html data-offline>`. `NETWORK_BOOT_SCRIPT`
  sets that attribute before paint, so an offline launch never flashes them.

A `hybrid` tool stays listed. Its one online feature (URL import, a dynamic QR
code, equation recognition) is disabled offline with
`<OnlineRequiredNote kind="feature">` beside it.

## Adding a tool

- Browser-only: nothing to do. The next build lists its chunks and its page.
- Loads anything from a CDN at runtime: add the host to `MODEL_HOSTS` in
  `public/sw.js`, and gate the control on "is it on the device" as above.
- Fetches a file from `public/`: add it to `PUBLIC_PRECACHE`; the test checks it
  exists.

## Verifying

The worker only registers in production. `bun run build && bun run start`
(ask first — `CLAUDE.md` rule 13), install from the address bar, then DevTools →
Application → Service workers → Offline, and open a tool you never visited.
