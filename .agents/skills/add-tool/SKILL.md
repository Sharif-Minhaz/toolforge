---
name: add-tool
description: >
  Any work on a ToolForge tool — building a new one, changing an existing one's controls, or
  refactoring one — covering the domain layer, tests, client island, route, article, both
  locales, and catalog and overview wiring, reusing the patterns the UUID and Base64 tools
  already set.
  Triggers on "add a new tool", "add <x> to the platform", "build the <x> tool",
  "new toolforge tool", "add this facility to <tool>", and equally on "refactor the <x>
  tool", "clean up the <x> module", "rework/restructure <x>", "extract this into a shared
  component", "move <x> out of <tool>", or /add-tool.
---

# Adding a tool to ToolForge

`AGENTS.md` and `CLAUDE.md` still apply in full. This skill is the build order and the
traps, not a replacement for them.

The UUID and Base64 tools are the reference implementations. **Read the closest one before
writing anything** — Base64 for input→output converters, UUID for generators. Copy their
structure; do not invent a second way to do the same thing.

---

## Three ways in

| The request | Start at |
| --- | --- |
| A tool that does not exist yet | *Step 0* below, then run the whole build order |
| A control added, removed, or changed on an existing tool | *When a tool's controls change later* |
| Restructuring, extracting, renaming, or tidying existing tool code | *Refactoring an existing tool* |

The last two still end at *Step 10 — verify, then hand off*. Every path finishes with the
same checks.

---

## Non-negotiables

1. **No new UI or folder patterns.** Every layout, token, and directory already exists.
   If something seems to need a new pattern, you have misread the existing one.
2. **Reuse the shared components** listed under *What already exists*. Never re-create
   `ArticleSection`, `ArticleToc`, `FaqAccordion`, `IconCopyButton`, or a copy/download flow.
3. **`domain/` stays framework-free.** No React, no `next-intl`, no I/O. A file that needs
   `getTranslations` is a presenter.
4. **Both locales, every key.** `en.json` and `bn.json` change in the same edit.
5. **Light and dark via semantic tokens only.** No raw colours, ever.
6. **Never commit, branch, or push.** Note that `git mv` stages — say so in the handoff.
7. **Never start a dev server, build, or browser without asking that time.**

---

## Step 0 — plan first, but only when it earns it

Plan and get sign-off **before writing files** when the tool has several interacting
options, a non-obvious domain model, or a format with real edge cases (encodings, time
zones, floating point). Propose the domain API, the exact control set, and how the options
constrain each other. One message, then wait.

Go straight to building for a simple tool: one input, one output, a couple of switches.

---

## Step 1 — register it

- Add the id to `TOOL_IDS` in `src/modules/tools/types/index.ts`.
- Add the entry to `src/modules/tools/domain/tool-catalog.ts`. `href` **must** be
  `/tools/<id>` — a test enforces it. Set `status: "planned"` until it ships, then flip to
  `"available"` in the same change that lands the page.
- Fill in `keywords`: lowercase, deduplicated, untranslated. These are the terms a person types
  who does not know your name for the thing — the abbreviation (`b64`), the spec (`rfc 9562`), the
  API they know it by (`btoa`). They drive both the in-app search and the page keyword tag, and
  tests enforce the lowercase and no-duplicates rules.
- Pick an `accent` from the five brand hues and an `icon` from `ToolIconName`. If no icon
  fits, add the key to **both** the union in `types/index.ts` and the map in
  `tool-icon.tsx`.
- `addedOn` is the real ship date, so "recent tools" stays honest.

## Step 2 — copy for both locales

`tools.<id>.name` and `tools.<id>.description` in `en.json` **and** `bn.json`.

Name the tool for everything it does. A converter is `"X Encoder / Decoder"`, not
`"X Encoder"` — the sidebar label is the only name most users ever see.

## Step 3 — domain layer, with tests, before any UI

```
src/modules/<tool>/
  domain/       pure logic, typed errors, explicit limit constants
  types/        literal unions (drives type-checked message keys)
  validation/   Zod schemas
  tests/        bun tests
```

- **Typed failures, never thrown errors** for anything the user can cause. A discriminated
  union — `{ ok: false; reason: ...; position?: number }` — that the UI maps to a localised
  message. Reserve `throw` for programmer error.
- One orchestrator function the page and the island both call (see `base64/domain/convert.ts`).
  Pure and deterministic, so the server-rendered pass already holds the result.
- Explicit constants for every limit, and a `MAX_*` ceiling on anything unbounded.

Get `bun test` green here. Do not start the UI first.

## Step 4 — Zod schemas

`validation/` covers options, search params, and any server action payload. Search params
use `.catch(undefined)` **per field**, so one malformed value degrades to a default instead
of a 500. Coerce impossible combinations server-side too — a link naming an option the
current mode cannot use should open on a default, not an error.

## Step 5 — the page

Server component. Mirror `src/app/tools/base64/page.tsx`:

- `generateMetadata` returns **`buildPageMetadata`** from
  `@/modules/seo/domain/metadata` — never a hand-written object. It supplies the canonical URL, the
  Open Graph card, the Twitter card, and the keyword list in one place. Pass the translated
  `<tool>.meta` strings, the active `locale` from `getLocale()`, and
  `getToolById("<id>")?.keywords`.
- `JsonLd` takes **`buildToolJsonLd`** from `@/modules/seo/domain/structured-data`, which emits
  `SoftwareApplication`, `FAQPage`, and `BreadcrumbList` as one graph. Hand-building the graph
  drifts; the helper does not.
- Parse search params, compute initial state, pass it to the island **as props**.
- `loading.tsx` with skeletons matching the real layout block for block.

Next **shallow-merges** metadata: a page that declares `openGraph` replaces the layout's entirely,
image included. That is the whole reason `buildPageMetadata` exists — a page that skips it silently
ships without a social card.

## Step 6 — one small client island

One `"use client"` component holds state; everything else stays a server component.

- Derive the result **during render** from a pure domain function. Do not generate in a
  `useState` initialiser — server and client would disagree and hydration breaks.
- **Debounce typed input at 300 ms** with `useDebouncedValue`. Discrete actions — presets,
  steppers, toggles, buttons — stay instant. Dim the stale result rather than clearing it.
- Hold interacting options in **one options object** with a single `patch` updater, not six
  `useState` calls.
- When one option makes another meaningless, **disable it with an explanatory hint**. Never
  emit output that cannot work.

## Step 7 — the article, written after the tool

Semantic sections with stable `id`s, each with a TOC entry, using `ArticleSection`,
`ArticleToc`, and `FaqAccordion`. Prose caps at `max-w-[68ch]`; tables break out inside
`overflow-x-auto`.

**Every control must be documented.** If the tool has more than two or three options, give
them a dedicated section with an Option / What it does / Reach for it when table, and follow
it with the caveats a table cannot hold — which options exclude each other, and what the
defaults assume. See `base64.article.options`.

## Step 8 — wire the overview

- Flip the catalog entry to `status: "available"`. The featured, popular, recent, and
  category grids are catalog-driven and pick it up automatically.
- Extend the client message slice in `src/app/layout.tsx` with the namespaces the island
  needs. A missing namespace only fails at runtime, so check it deliberately.
- **Add one Quick Action** in `src/modules/overview/components/quick-actions.tsx` for the
  new tool, with `overview.quickActions.<key>.{title,description}` in both locales. Point it
  at the single most common task, using search params where they help. Cap the list at six —
  when a seventh arrives, drop the entry for the lowest-`popularity` tool. Give it an accent
  not already used by its neighbours.
- Nothing to do for `sitemap.ts` or `robots.ts`: the sitemap reads `getAvailableTools()`, so
  flipping the status is what publishes the route. Confirm it appears rather than assuming it —
  a tool left at `"planned"` is silently absent from the sitemap.

## Step 9 — update the documentation

A tool is not shipped until the docs stop describing the repository as it was before it.
Documentation drift is a defect in *this* change, never a follow-up.

- **`README.md` Tools table** — add the row (name, route, category, one line on what it does)
  and remove the tool from the planned list underneath.
- **`example.env` and the README environment table** — together, never one without the other.
  Say what each variable is for and what degrades when it is blank.
- **README configuration table** — any new top-level config file, or a change to what an
  existing one owns.
- **README Scripts table** — any new `package.json` script.
- **README project structure** — any new directory under `src/modules/<feature>/`.
- **`CONTRIBUTING.md`** — only when the tool changes how contributors work: a new shared
  component worth reusing, a new directory in the module layout, a new verification step.
- **`CLAUDE.md`** — only when the tool establishes a pattern the next one should follow, or a
  trap the next author would otherwise walk into.

Re-read the sections you touched and ask whether they are still true. A reader landing on the
README must never be told a shipped tool is still planned.

## Step 10 — verify, then hand off

Always, and always all four:

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --check "src/**/*.{ts,tsx,css,json}"
```

Then check locale parity — a missing Bangla key is a runtime failure, not a type error:

```bash
node -e "
const en=require('./src/messages/en.json'), bn=require('./src/messages/bn.json');
const keys=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v!==null?keys(v,p+k+'.'):[p+k]);
const a=keys(en), b=keys(bn);
console.log('missing in bn:', a.filter(k=>!b.includes(k)).join(', ')||'none');
console.log('extra in bn:', b.filter(k=>!a.includes(k)).join(', ')||'none');
"
```

If `bun test` cannot reach part of the behaviour because Bun lacks a Web API the browser
has, **verify that part on Node separately** and say which route you used — see
`references/pitfalls.md`.

Hand off with a plain statement that the UI is unverified visually, plus what to look at:
light and dark, English and Bangla, 390 px and 1440 px, sidebar expanded and collapsed, and
`document.documentElement.scrollWidth === window.innerWidth` at 390 px.

---

## When a tool's controls change later

This is the step that gets skipped. Adding, removing, or renaming a control means all of:

1. The **article** — the options table, the caveats about option interactions, and any FAQ
   answer that names a control or a default.
2. `<tool>.meta.description` and `hero.subtitle` — both describe the feature set and quietly
   go stale.
3. `loading.tsx` — the skeleton must still match the real layout.
4. Both locales for every string above.
5. Tests for the new behaviour, and the shared-domain tests if a signature moved.

Treat "the copy underneath still describes the old tool" as a bug in the change, not a
follow-up.

---

## Refactoring an existing tool

Same rules, different failure mode: a refactor that type-checks can still have left the
codebase half-migrated.

**Do not refactor and add behaviour in the same pass.** Land the move, get it green, then
build on top. A diff that does both is unreviewable and hides regressions.

**Establish the baseline first.** Run `bun test` before touching anything. If a test has to
change during a refactor, that is a behaviour change — stop and say so, rather than editing
the assertion to match the new output.

**Lifting shared code out of a tool module** — the most common refactor here:

1. `git mv` the file to `src/modules/tools/components/` or `domain/`, so history follows it.
   Note in the handoff that `git mv` stages the rename.
2. Update the original tool's imports **in the same change**. Never leave a tool importing
   from another tool's module.
3. Generalise the name if the old one was tool-specific. `DownloadFile` moved from
   `uuid/types` to `tools/types` because it was never about UUIDs.
4. Re-export from the old location only if something outside the repo depends on it —
   inside this repo, update the callers instead.

**Renaming a domain concept ripples further than it looks.** Renaming one failure reason
touched the types, the codec, the orchestrator, three test files, both message catalogues,
and the switch in the island. Do the whole rename in one pass and grep afterwards — a
partial rename still type-checks whenever the old union member is left in place.

**Widening a shared type** breaks every test that constructs it. Fix the test factory
function, not each call site; if the tests do not have one, that is the refactor to do first.

**Message keys are not type-checked on the way out.** Removing or renaming a key means
removing it from `en.json`, `bn.json`, and the client slice in `src/app/layout.tsx`. An
orphaned key rots silently; a missing one fails at runtime.

**After any refactor, grep for what the compiler cannot see:** stale message keys, stale
`data-*` or `layoutId` strings, and imports that resolve but now cross a module boundary
they should not.

---

## What already exists — use it

| Need | Import |
| --- | --- |
| Article section, prose widths | `@/modules/tools/components/article-section` |
| Sticky table of contents | `@/modules/tools/components/article-toc` |
| FAQ | `@/modules/tools/components/faq-accordion` |
| Copy button, copy/check swap | `@/modules/tools/components/copy-button` |
| Accent vars, icon tile | `@/modules/tools/components/tool-accent` |
| Catalog icon | `@/modules/tools/components/tool-icon` |
| Clipboard, typed result | `@/modules/tools/domain/clipboard` |
| File download | `@/modules/tools/domain/file-saver` |
| `DownloadFile` and catalog types | `@/modules/tools/types` |
| 300 ms debounce | `@/hooks/use-debounced-value` |
| Hydration-gated UI | `@/hooks/use-is-hydrated` |
| Entrance motion | `@/components/motion/reveal` |
| Page metadata (canonical, OG, Twitter, keywords) | `@/modules/seo/domain/metadata` |
| Tool JSON-LD graph | `@/modules/seo/domain/structured-data` |
| Structured data `<script>` | `@/modules/seo/components/json-ld` |
| Canonical URLs, OG image, site constants | `@/modules/seo/domain/site` |
| Structured logging | `@/modules/observability/domain/logger` |

Shared UI belongs in `modules/tools/`, never inside another tool's module. If a second tool
needs something the first one owns, lift it — and update the first tool's imports in the
same change.

Need a shadcn primitive that is not in `src/components/ui`? `bunx --bun shadcn@latest add
<component>`. Never hand-write one, never edit one.

---

## Traps

Read `references/pitfalls.md` before the domain layer and again before the island. Every
entry in it is a bug that actually shipped into a review.
