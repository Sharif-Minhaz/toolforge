# Contributing to ToolForge

Thanks for taking the time. ToolForge is a small, opinionated codebase, and the rules below exist
so that every tool in it looks and behaves like it was built by the same person.

This file is the working agreement. [CLAUDE.md](CLAUDE.md) is the long-form version with the
reasoning behind each rule — read it before a substantial change.

---

## Ways to contribute

- **Build a planned tool.** Seven are listed in the catalogue with `status: "planned"`. This is
  the most useful thing you can do, and the path is well worn — see [Adding a tool](#adding-a-tool).
- **Improve a shipped tool.** More formats, better edge-case handling, clearer copy.
- **Fix a bug.** Open an issue first if it is not obvious, so the fix and the report can be
  discussed in one place.
- **Improve the Bangla translation.** Native review of `src/messages/bn.json` is genuinely welcome.
- **Improve accessibility.** Focus order, screen-reader labels, contrast.

Please open an issue before starting anything large. A tool takes a day to build properly, and it
is worth ten minutes of agreement first.

---

## Ground rules

These are not negotiable. A pull request that breaks one of them will be asked to change.

1. **Bun only.** `bun install`, `bun add`, `bunx`. Never npm, pnpm, or yarn — a second lockfile
   will be rejected.
2. **Never use `any`.** If the type is hard, that is usually the design telling you something.
3. **Never disable a TypeScript or ESLint rule.** Restructure the code until the rule is satisfied.
   No `eslint-disable`, no `@ts-ignore`, no `@ts-expect-error`.
4. **Never edit `src/components/ui/`.** That is vendored shadcn code. Customise through
   composition, props, variants, `className`, and slots. Need a primitive that is not there?
   `bunx --bun shadcn@latest add <component>`.
5. **Never introduce a new UI or folder pattern.** Every layout, token, and directory you need
   already exists. If something seems to need a new one, you have probably misread the existing one.
6. **Both locales, always.** `en.json` and `bn.json` change in the same commit. A missing Bangla key
   fails the type check.
7. **Light and dark, always.** Use the semantic tokens in `src/app/globals.css`. Never a raw colour.
8. **No `console.*` in feature code.** Use `logEvent` from
   `src/modules/observability/domain/logger.ts`.
9. **Never bypass the domain layer.** UI does not import Prisma or Supabase. Ever.
10. **If you use an AI coding agent, point it at this repo's own instructions first.** See
    [Using an AI coding agent](#using-an-ai-coding-agent).

---

## Using an AI coding agent

Using Claude Code, Cursor, Copilot, or anything similar is welcome. Letting one loose without the
repo's instructions is not — the result is invariably a second way of doing something the codebase
already does once, and it will be sent back.

**Before the agent writes anything, it must read:**

- **[CLAUDE.md](CLAUDE.md)** — the full engineering guidelines. This is the authority on structure,
  the design system, i18n, testing, and what is forbidden. Load it into context; do not summarise
  it and hope.
- **[AGENTS.md](AGENTS.md)** — short, and easy to skip at your peril. This is **not** the Next.js
  in the model's training data. Version 16 changed APIs, conventions, and file names. The guides in
  `node_modules/next/dist/docs/` are the source of truth, not the model's memory of Next 13.

**For any tool work — new, changed, or refactored — the agent must follow the `add-tool` skill**,
which ships in this repository at
[`.agents/skills/add-tool/SKILL.md`](.agents/skills/add-tool/SKILL.md), with its trap list in
[`references/pitfalls.md`](.agents/skills/add-tool/references/pitfalls.md). It carries the build
order and the mistakes that have already cost someone a day. It applies to all three cases:

- adding a tool that does not exist yet
- adding, removing, or changing a control on an existing one
- restructuring, extracting, renaming, or tidying existing tool code

Claude Code picks the skill up automatically from `.claude/skills/add-tool`. With any other agent,
paste `SKILL.md` and `pitfalls.md` into context yourself before starting.

**You are the author, not the agent.** Whatever arrives in the pull request is yours to defend:

- Read every line before you commit it. "The AI wrote it" is not a review response.
- Run the [checks](#before-you-open-a-pull-request) yourself. Do not trust a claim that they passed.
- Look at UI changes in a real browser, in both themes and both languages. Agents cannot do this,
  and they routinely say a thing works when nobody has looked at it.
- Delete the invented abstraction. Agents like to add a helper, a wrapper, or a new folder where
  the existing pattern was fine.
- Check both message catalogues actually changed, and that the Bangla is real Bangla — machine
  translation of technical copy tends to be wrong in ways the type checker cannot see.

If a generated change is large and you have not read all of it, say so in the pull request rather
than letting the reviewer find out.

---

## Getting set up

See [Getting started](README.md#getting-started) in the README. In short: Bun, Node 20+,
`bun install`, `cp example.env .env.local`, `bun run db:generate`, `bun run dev`.

---

## Workflow

**Never commit to `main`, and never open a pull request from it.** Every change starts on its own
branch, in your own fork.

1. Fork the repository, then branch from an up-to-date `main`:

    ```bash
    git checkout main
    git pull upstream main
    git checkout -b feat/json-formatter
    ```

2. Make the change. Keep the diff focused — **one concern per branch, one concern per pull
   request.** A branch that adds a tool _and_ reformats an unrelated file will be asked to split.
3. Commit in logical steps, using the message format below.
4. Run the [verification commands](#before-you-open-a-pull-request).
5. Push the branch and open a pull request against `main`, filling in the template.

One branch is one pull request. If review feedback arrives, push more commits to the same branch —
do not open a second one.

### Branch names

`<type>/<short-kebab-description>`. Use the same `type` vocabulary as the commits below, so the
branch and its commits agree.

| Branch                        | For                                    |
| ----------------------------- | -------------------------------------- |
| `feat/json-formatter`         | A new tool                             |
| `feat/base64-url-safe-toggle` | A new control on an existing tool      |
| `fix/uuid-v7-monotonic`       | A bug fix                              |
| `refactor/lift-faq-accordion` | Restructuring with no behaviour change |
| `docs/contributing-guide`     | Documentation only                     |
| `test/base64-charset-matrix`  | Tests only                             |
| `chore/bump-next-16-2-12`     | Dependencies, config, tooling          |
| `i18n/bangla-uuid-copy`       | Translation work                       |
| `a11y/sidebar-focus-order`    | Accessibility work                     |

Keep it lowercase and hyphenated. No personal prefixes (`minhaz/fix-thing`), no bare ticket
numbers (`issue-42`) — the name should say what the branch does.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<optional scope>): <subject>

<optional body — the why>

<optional footer — Closes #123, BREAKING CHANGE: …>
```

The `type` is required and must be one of:

| Type       | Use it when                                                    |
| ---------- | -------------------------------------------------------------- |
| `feat`     | A user-visible capability appears                              |
| `fix`      | Behaviour that was wrong is now right                          |
| `refactor` | The code moved or changed shape; behaviour did not             |
| `perf`     | Same behaviour, measurably faster or lighter                   |
| `test`     | Tests added or corrected, with no production change            |
| `docs`     | README, CONTRIBUTING, comments, article copy                   |
| `style`    | Formatting only — Prettier, import order. Never a logic change |
| `i18n`     | Message catalogue and translation work                         |
| `a11y`     | Accessibility fixes                                            |
| `build`    | Build pipeline, Next or Tailwind config, Prisma generation     |
| `chore`    | Dependencies and housekeeping that fits nothing above          |
| `revert`   | Undoing a previous commit; name it in the body                 |

The scope, when you use one, is the module or tool the change lives in: `uuid`, `base64`, `tools`,
`seo`, `i18n`, `overview`, `deps`.

Good:

```
feat(base64): add per-line decoding
fix(uuid): keep v7 ascending after a counter overflow
refactor(tools): lift the FAQ accordion out of the uuid module
test(base64): cover the legacy charset matrix
i18n(bn): correct the Bangla copy for the quantity stepper
docs: add contributing guide
chore(deps): bump next to 16.2.12
```

With a body, because the reason is not in the diff:

```
fix(uuid): keep v7 ascending after a counter overflow

Overflowing the 12-bit counter borrows a millisecond from the future, so the
generator's timestamp sits ahead of the clock. Every id after that took the
"clock moved" branch and reseeded the counter randomly, which could produce a
smaller counter at the same timestamp — breaking the documented ordering.

Closes #41
```

Not acceptable:

```
update                      no type, says nothing
fix bug                     which bug? in what?
feat: changes               a subject has to name the change
WIP                         squash it before you push
Fixed the thing!!!          past tense, no type, shouting
feat(base64): Added support for per-line decoding and also fixed a typo in
                            two concerns, past tense, too long
```

Rules for the subject line: imperative mood ("add", not "added" or "adds"), lowercase after the
colon, no trailing full stop, and under about 72 characters. Explain **why** in the body whenever
the reason is not obvious from reading the diff — that is the part a future reader cannot
reconstruct.

### Pull request descriptions

The template is filled in, not deleted. Say what changed, why, which checks you ran, and — plainly
— anything you could not verify. Link the issue with `Closes #123` so it closes on merge.

A description that is only "fixes stuff" will be sent back for one that is not.

---

## Code standards

### TypeScript

Strict mode, explicit names, early returns, shallow nesting. Functions do one thing. Prefer typed
discriminated unions over thrown exceptions for anything a user can cause:

```ts
export type DecodeResult =
    | { readonly ok: true; readonly text: string }
    | { readonly ok: false; readonly reason: "invalid_character"; readonly position: number };
```

Reserve `throw` for programmer error.

### Components

- **Server Components by default.** Reach for `"use client"` only for browser APIs, state,
  animation, or event handlers, and keep the client island as small as possible.
- One interactive component per tool holds the state. Everything static stays on the server.
- **Generate per-request values on the server** and pass them down as props. Never in a `useState`
  initialiser — the server and the client produce different values and hydration breaks.
- **Debounce typed input at 300 ms** using `@/hooks/use-debounced-value`. Discrete actions — presets,
  steppers, toggles, buttons — stay instant. Dim a stale result rather than blanking it.

### Styling

Tailwind CSS v4, CVA, and `tailwind-merge` through `cn`. The design tokens live in
`src/app/globals.css`:

- Semantic tokens (`--background`, `--card`, `--muted-foreground`, …) are defined for both themes.
- Five brand accents: `--brand-{violet,cyan,amber,rose,emerald}`. A component opts in via
  `TOOL_ACCENT_VARS[accent]`, which sets `--tool-accent`; every tinted surface reads that one
  variable.
- Cards are `rounded-2xl`, controls `rounded-xl`, small chips `rounded-lg`.
- Motion is 200–300 ms on `[0.22, 0.61, 0.36, 1]`. Respect `useReducedMotion()`.

Grid and flex children need `min-w-0`, or long unbroken output blows the page out at 390 px. Wide
content scrolls inside its own `overflow-x-auto`; the body never scrolls horizontally.

### Server architecture

Server Components → Server Actions → Route Handlers, in that order of preference. Only write a
Route Handler when you genuinely need one: webhooks, uploads, streaming, external APIs, third-party
callbacks. Do not add REST endpoints for things a Server Action can do.

### Data access

Only files under `repository/` may import Prisma or Supabase. Everything else calls the domain
layer:

```ts
await getUsers(); // yes
prisma.user.findMany(); // no
```

Supabase is for authentication, storage, and realtime. Database access goes through Prisma.

### Validation

Zod for forms, route params, search params, APIs, and Server Actions. Never trust client input.
Search params use `.catch(undefined)` **per field**, so one malformed value in a shared link
degrades to a default instead of a 500.

### Internationalisation

- Never hardcode user-facing text. `t("settings.title")`.
- Message keys may only be built from **literal unions** (`ToolId`, `UuidVersion`, a `readonly`
  tuple). Building a key from a plain `string` defeats the type checking.
- Numbers that read as prose go through `useFormatter().number()` or an ICU `{value, number}`
  argument, so Bangla renders Bengali numerals. Keep Western digits only where the number mirrors
  machine input — form fields, presets, row indices.
- Proper names — `UTF-8`, `RFC 4648`, `LF (Unix)` — are data, not copy. Keep them out of the
  catalogue.
- Client components get a hand-picked slice of the catalogue in `src/app/layout.tsx`. A namespace
  missing there fails at runtime, not at build — check it deliberately.
- Bengali ascenders are taller than Latin. Never put `leading-none` on a localised string.

### Loading and error states

Every async page needs a `loading.tsx` whose skeleton matches the real layout block for block.
Never a blank page, and prefer skeletons to spinners. For client mutations, disable the action while
pending and show an inline indicator. Cover all four states: loading, success, error, empty.

### Accessibility

Keyboard navigation, visible focus states, accessible labels, and screen-reader support are part of
the feature, not a follow-up. Hover-only affordances must stay reachable without a pointer — gate
them on `[@media(hover:hover)]` and pair with `focus-visible:opacity-100`.

---

## Testing

Every tool feature needs unit tests. They live in `src/modules/<feature>/tests/*.test.ts` and import
through the `@/` alias.

```bash
bun test
```

Test the domain layer, not the markup:

- generation and transformation logic, per version and per mode
- boundary validation — min, max, off-by-one, `NaN`, fractional, negative
- serialisation for every export format, including the empty case
- typed-result helpers (`copyText`, `saveFile`) through injected fakes

Two conventions worth keeping:

- Prefer a typed `for…of` loop over `test.each`. Bun types the `test.each` callback parameter as
  `unknown`, which forces casts.
- Anything touching the DOM or clipboard takes its dependency as a parameter with a browser default
  (`copyText(text, clipboard = …)`), so tests pass a fake instead of needing a DOM.

**An intermittent failure is a bug report, not noise.** Do not rerun until it goes green. It usually
means module-level mutable state plus a real clock. Reproduce it deterministically by injecting the
clock, fix the cause, and prove the new test catches it by reverting the fix.

Also note that `bun test` is not a browser. Bun ships far fewer `TextDecoder` encodings than Node or
a browser, for example. If a test cannot reach some behaviour because of that, verify it separately
and say so in the pull request.

---

## Adding a tool

Work in this order. Each step has a rule that is easy to skip.

1. **Register it.** Add the id to `TOOL_IDS` in `src/modules/tools/types/index.ts`, then the entry
   in `src/modules/tools/domain/tool-catalog.ts` with `status: "planned"` until it ships. `href`
   must be `/tools/<id>` — a test enforces this. Pick an `accent` from the five brand hues and an
   `icon` from `ToolIconName`.
2. **Add copy to both locales.** `tools.<id>.name` and `tools.<id>.description` in `en.json` _and_
   `bn.json`. Name the tool for everything it does — a converter is `"X Encoder / Decoder"`, not
   `"X Encoder"`, because the sidebar label is the only name most users ever see.
3. **Build the domain layer first, with tests.** Pure functions, typed errors, explicit constants
   for every limit. Get `bun test` green before writing any UI.
4. **Add Zod schemas** in `validation/` for options, search params, and any Server Action payload.
5. **Build the page** as a Server Component: `generateMetadata` from `<tool>.meta` with
   `alternates.canonical`, `openGraph`, and `twitter`; `JsonLd` emitting `SoftwareApplication`,
   `BreadcrumbList`, and `FAQPage`; initial results generated on the server and passed to the island
   as props; and a `loading.tsx` matching the layout.
6. **Keep the client island small.** One interactive component holding state. Hold interacting
   options in a single options object with one patch updater, not six `useState` calls. When one
   option makes another meaningless, disable it with an explanatory hint rather than silently
   ignoring it.
7. **Write the article after the tool.** Semantic sections with stable `id`s and a TOC entry, prose
   capped at `max-w-[68ch]`, tables breaking out inside `overflow-x-auto`. Document every control.
8. **Wire the overview.** Flip the catalog entry to `status: "available"`, extend the client message
   slice in `src/app/layout.tsx`, and add a Quick Action in
   `src/modules/overview/components/quick-actions.tsx` with copy in both locales.
9. **Update the docs in the same pull request.** Add the tool to the table in
   [README.md](README.md#tools) and take it out of the planned list. If it needs configuration of
   its own, add every variable to `example.env` _and_ the README's environment table; if it changes
   how contributors work, update this file too. A tool that ships without its documentation is not
   finished — a reader landing on the README should never be told a shipped tool is still planned.

Reuse what exists rather than rebuilding it:

| Need                          | Import                                       |
| ----------------------------- | -------------------------------------------- |
| Article section, prose widths | `@/modules/tools/components/article-section` |
| Sticky table of contents      | `@/modules/tools/components/article-toc`     |
| FAQ                           | `@/modules/tools/components/faq-accordion`   |
| Copy button                   | `@/modules/tools/components/copy-button`     |
| Accent vars, icon tile        | `@/modules/tools/components/tool-accent`     |
| Region + city zone picker     | `@/modules/tools/components/zone-picker`     |
| Clipboard, typed result       | `@/modules/tools/domain/clipboard`           |
| File download, text or blob   | `@/modules/tools/domain/file-saver`          |
| Upload type and size gate     | `@/modules/tools/domain/image-file`          |
| Decode an image, read its size| `@/modules/tools/domain/image-element`       |
| Worker URL from a variable    | `@/modules/tools/domain/endpoint`            |
| Turnstile widget, verification | `@/modules/tools/components/turnstile-widget` |
| Wall clock ↔ instant, offsets | `@/modules/tools/domain/zone`                |
| Frozen IANA zone list         | `@/modules/tools/domain/time-zones`          |
| Gregorian calendar arithmetic | `@/modules/tools/domain/calendar`            |
| 300 ms debounce               | `@/hooks/use-debounced-value`                |
| Structured data               | `@/modules/seo/components/json-ld`           |
| Structured logging            | `@/modules/observability/domain/logger`      |

Shared UI belongs in `src/modules/tools/`, never inside another tool's module. If a second tool
needs something the first one owns, lift it with `git mv` and update the first tool's imports in the
same change.

**The UUID and Base64 modules are the reference implementations.** Read the closer one before you
start: Base64 for input→output converters, UUID for generators.

### When a tool's controls change

This is the step that gets skipped. Adding, removing, or renaming a control means all of:

1. The **article** — the options table, the caveats about how options interact, and any FAQ answer
   that names a control or a default.
2. `<tool>.meta.description` and `hero.subtitle` — both describe the feature set and go stale
   quietly.
3. `loading.tsx`, so the skeleton still matches the real layout.
4. Both locales for every string above.
5. Tests for the new behaviour.

"The copy underneath still describes the old tool" is a bug in the change, not a follow-up.

---

## Before you open a pull request

Run all four. They are cheap and they gate the review:

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --check "src/**/*.{ts,tsx,css,json}"
```

Then confirm the message catalogues still match key for key:

```bash
node -e "
const en=require('./src/messages/en.json'), bn=require('./src/messages/bn.json');
const keys=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v!==null?keys(v,p+k+'.'):[p+k]);
const a=keys(en), b=keys(bn);
console.log('missing in bn:', a.filter(k=>!b.includes(k)).join(', ')||'none');
console.log('extra in bn:', b.filter(k=>!a.includes(k)).join(', ')||'none');
"
```

Static checks do not catch layout, contrast, or overflow. If the change is UI-visible, look at it in
a browser and confirm:

- [ ] Light mode and dark mode
- [ ] English and Bangla
- [ ] 390 px and 1440 px
- [ ] Sidebar expanded and collapsed
- [ ] At 390 px, `document.documentElement.scrollWidth === window.innerWidth`
- [ ] Keyboard: every control reachable, focus visible, tab order sensible

If you could not check something, say so in the pull request. An honest gap is far more useful than
an unverified claim.

---

## Reporting bugs

Open an issue with the tool, the exact input, what you expected, what happened, and your browser.
For anything that looks like a security problem, please email the maintainer rather than opening a
public issue.

---

## Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licensing of contributions

Contributions are accepted under the [MIT License](LICENSE). By opening a pull request you agree
your work is licensed under those same terms.
