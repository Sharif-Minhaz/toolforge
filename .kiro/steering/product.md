---
inclusion: always
---

# ToolForge — Product

A free, privacy-first toolbox of developer and utility tools. Everything that can run in
the browser does run in the browser: input is not shipped to a server for processing.

Repository: https://github.com/Sharif-Minhaz/toolforge

## What a "tool" is here

One route (`/tools/<id>`), one domain module (`src/modules/<id>/`), one interactive client
island, one long-form article. Tools are catalogued in
`src/modules/tools/domain/tool-catalog.ts` and their ids are a literal union in
`src/modules/tools/types/index.ts` (`TOOL_IDS`).

Categories: `generators`, `encoding`, `formatting`, `security`, `text`, `ai`.

Status is either `available` or `planned`. A tool lands in the catalog as `planned` and
flips to `available` when its page ships.

## Shipped tools

`uuid`, `base64`, `jwt`, `hash`, `json`, `url`, `markdown`, `regex`, `lorem`, `color`, `cron`,
`timestamp`, `ai-text-detector`, `ai-image-detector` — each with a page under
`src/app/tools/<id>/`.

## Queued (catalogued, page not built)

`password`, `qr`, `slug`, `diff`, `gemini-watermark-remover`.

## Audience and tone

Developers. Copy is plain, precise, and short. Articles explain the format or algorithm the
tool operates on, not the UI. No marketing voice.

## Non-negotiables

- Two locales, always in lockstep: English (`en`, default) and Bangla (`bn`).
- Light mode and dark mode are both first-class. Dark is a separate palette, not an inversion.
- Keyboard navigation, visible focus, accessible labels — every feature.
- No blank async states. Skeletons that match the real layout.
