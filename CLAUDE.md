@AGENTS.md

# ToolForge Engineering Guidelines

ToolForge is a free developer and utility toolbox.

These rules are mandatory unless explicitly instructed otherwise.

---

# Tech Stack

- Next.js 16+
- React 19
- TypeScript (strict)
- Tailwind CSS v4
- Base UI
- shadcn/ui
- Prisma ORM
- PostgreSQL
- Supabase (Auth/Storage only)
- next-intl
- Bun
- Prettier
- ESLint

---

# General Principles

- Prefer simplicity and maintainability.
- Keep files focused on a single responsibility.
- Avoid unnecessary abstractions and duplicated logic.
- Use strict typing.
- Never use `any`.
- Never disable TypeScript or ESLint rules.

---

# Formatting

Prettier is the source of truth.

Always:

- Format modified files.
- Organize imports.
- Remove unused imports and variables.
- Keep naming consistent.

---

# Package Manager

Always use Bun.

```bash
bun install
bun add
bun remove
bun run
bun test
bunx
```

Never use npm, pnpm or yarn.

---

# UI Components

Before creating any UI component:

1. Check whether shadcn/ui already provides it.
2. If available, generate it:

```bash
bunx --bun shadcn@latest add <component>
```

Never manually recreate existing shadcn components.

### components/ui

Everything inside `components/ui` is vendor code.

Never modify it.

Customize only using:

- composition
- wrappers
- props
- variants
- className
- slots

---

# Component Rules

- Prefer Server Components.
- Use Client Components only for browser APIs, state, animations or event handlers.
- Keep client components as small as possible.

---

# Styling

Use:

- Tailwind CSS
- CVA
- tailwind-merge

Avoid custom CSS unless absolutely necessary.

Every feature must fully support:

- Light Mode
- Dark Mode

---

# Loading States

Every asynchronous page or component must expose a loading state.

### Rules

- Create `loading.tsx` for async App Router pages.
- Never show blank pages.
- Prefer skeletons over spinners.

Generate Skeleton if missing:

```bash
bunx --bun shadcn@latest add skeleton
```

Skeletons should closely resemble the final layout.

Support:

- Light Mode
- Dark Mode

For client mutations:

- disable actions while pending
- use optimistic UI when appropriate
- show inline loading indicators

Always expose appropriate:

- Loading
- Success
- Error
- Empty

Prefer Suspense boundaries for independently loading sections.

---

# Internationalization

Use `next-intl`.

Supported languages:

- English (`en`, default)
- Bangla (`bn`)

Never hardcode UI text.

```tsx
t("settings.title");
```

### No `[locale]` route segment

Locale comes from the `toolforge.locale` cookie, not the URL. Tool routes stay
canonical (`/tools/uuid`, never `/en/tools/uuid`).

- `src/i18n/config.ts` — locale union, default, cookie name, endonyms.
- `src/i18n/locale.ts` — server-only cookie read.
- `src/i18n/request.ts` — `getRequestConfig`; honours an explicit `locale`
  argument before falling back to the cookie, so build-time assets never touch
  request cookies.
- `src/modules/preferences/actions/set-locale.ts` — the only writer. Zod
  validated; the client calls it then `router.refresh()`.

Because the layout reads cookies, every route renders dynamically. That is
intentional — it is also what lets the UUID page server-render a fresh result.

### Message catalogue

`src/messages/{en,bn}.json`. Both files must stay key-for-key identical.
`src/global.d.ts` types `AppConfig["Messages"]` from `en.json`, so keys are
checked at compile time.

Only build message keys from literal unions (`ToolId`, `ToolCategory`,
`UuidVersion`). Never from a plain `string` — it defeats the typing.

### Client bundles get a subset

`src/app/layout.tsx` passes a hand-picked slice of the catalogue to
`NextIntlClientProvider`. Long-form article copy stays on the server. When a
new client component needs a namespace, add it to that slice explicitly.

Server components localise data before it crosses the boundary — see
`src/modules/tools/presenters/localize-tools.ts`. Client components receive
`LocalizedTool[]`, not raw catalog entries plus a translator.

### Numbers

Counts that read as prose go through `useFormatter().number()` /
`getFormatter()`, or an ICU `{value, number}` argument, so Bangla renders
Bengali numerals. Raw JSX numbers do not.

Keep Western digits only where the number mirrors machine input: form field
values, quantity presets, and result-list row indices.

A number too big for a grouping separator needs a name, not a notation.
`Intl`'s two options both fail past a point: compact runs out of CLDR names
after "T", so 4.1 × 10²⁰ renders as `410,000,000T` in English and as a string of
lakh-crores in Bangla, and scientific renders it as `4.1E20`, which is exact and
tells a non-specialist nothing. `tools/domain/magnitude.ts` classifies the
magnitude — plain under a million, a short-scale name up to a decillion, `10ⁿ`
above that — and `tools/components/use-readable-number.ts` turns that into
"410 quintillion" from the `common.magnitude` messages. The names are translated
because CLDR's are not reachable this high; the digits still go through `Intl`.

It returns a `string`, not a node, because the result is nearly always an ICU
argument — `"{value} years"` is one message and a `ReactNode` cannot be passed
into it. That is also why the exponent uses Unicode superscript glyphs: they
survive inside a translated string, and Unicode has no Bengali superscripts, so
they stay Latin in both locales exactly as the Bangla copy already writes 10¹¹.

### Bangla typography

Inter carries no Bengali glyphs. `--font-sans` falls through to
`Noto Sans Bengali` per glyph. Bengali ascenders are taller than Latin, so
never put `leading-none` on a localized string — badges need `leading-[1.3]`
or looser.

---

# Server Architecture

Prefer:

```
Server Components
↓
Server Actions
↓
Route Handlers
```

Only use Route Handlers when required for:

- webhooks
- uploads
- streaming
- external APIs
- third-party callbacks

Do not create unnecessary REST endpoints.

---

# Database Rules

UI must never directly access:

- Prisma
- Supabase

Always go through the Domain Layer.

Example:

```
modules/users/

domain/
repository/
actions/
validation/
types/
```

Components call:

```ts
await getUsers();
```

not

```ts
prisma.user.findMany();
```

---

# Repository Layer

Only repositories may access:

- Prisma
- Supabase

Application code must never import either directly.

---

# Supabase

Use Supabase only for:

- Authentication
- Storage
- Realtime

Database access must always go through Prisma.

---

# Business Logic

Business rules belong in the Domain Layer.

Components should never contain business logic.

---

# Validation

Use Zod for:

- forms
- route params
- search params
- APIs
- Server Actions

Never trust client input.

---

# Testing

Every tool feature requires unit tests.

Run with `bun test`. Tests live in `src/modules/<feature>/tests/*.test.ts` and
import through the `@/` alias.

Focus on correctness, edge cases and regressions. Do not chase coverage
percentages.

Test the domain layer, not the markup:

- generation and transformation logic (per version, per mode)
- boundary validation (min, max, off-by-one, `NaN`, fractional, negative)
- serialisation for every export format, including the empty case
- typed-result helpers (`copyText`, `saveFile`) via injected fakes

Two conventions worth keeping:

- Prefer a typed `for…of` loop over `test.each`. Bun's `test.each` types the
  callback parameter as `unknown`, which forces casts.
- Anything that touches the DOM or clipboard takes its dependency as a
  parameter with a browser default (`copyText(text, clipboard = …)`), so tests
  pass a fake instead of needing a DOM.

---

# Folder Structure

Feature-first. This is the real layout — mirror it.

```
src/
  app/                        routes only: page, layout, loading, not-found
    tools/<tool>/page.tsx
    tools/<tool>/loading.tsx
  components/
    brand/                    logo mark and wordmark
    layout/                   app shell, sidebar, drawer, theme, locale
    motion/                   Reveal / FadeIn wrappers
    ui/                       shadcn vendor code — never edit
  hooks/                      cross-feature client hooks
  i18n/                       locale config, cookie read, request config
  messages/                   en.json, bn.json
  modules/
    <feature>/
      actions/                "use server" entry points
      components/             feature UI
      domain/                 pure logic — no React, no next-intl, no I/O
      presenters/             server-only: domain data + translations → view data
      repository/             the only place Prisma or Supabase may be imported
      tests/                  bun tests
      types/                  shared types and literal unions
      validation/             Zod schemas
```

Categories are a literal union too (`TOOL_CATEGORIES`), and the sidebar groups
its list under one heading per category. A new category needs the union widened
**and** `categories.<id>.name`/`.description` in both locales, or the rail
renders a heading with no words in it.

Existing feature modules: `tools` (catalog, search, clipboard, file saving,
plus the shared time-zone and calendar layer: `domain/zone.ts`,
`domain/time-zones.ts`, `domain/calendar.ts`, `components/zone-picker.tsx`, the
injectable random source `domain/random.ts`, and the shared image layer:
`domain/image-codec.ts`, `domain/pixels.ts`, `domain/archive.ts`,
`domain/base64.ts`, `domain/hex.ts`, `domain/filenames.ts`, and the shared code
layer: `domain/highlight.ts` with `components/code-editor.tsx` and
`components/code-block.tsx`, the shared JSON reader and writer
`domain/json-parser.ts` and `domain/json-serialize.ts` over
`types/json-tree.ts`, the shared network layer: `domain/ip.ts`,
`domain/host-syntax.ts`, `repository/address-guard.ts`,
`components/scan-radar.tsx`, the shared account-free identity and metering
layer both studios run on: `domain/browser-secret.ts`, `domain/recovery-key.ts`,
`domain/secret-cookie.ts`, `domain/server-key.ts`, `domain/rate-window.ts` and
`repository/rate-counter.ts`, and the shared input-ceiling layer every box on
the site reads: `domain/input-limit.ts` with
`components/input-limit-meter.tsx`, plus `domain/payload-size.ts` for the two
payloads Zod passes through — see **Telling Somebody How Full the Box Is**),
`short-links` (every re-pointable
link on the site — see below), `image-compressor` (a batch queue and a
smallest-of-four search), `image-converter` (a named target per batch, plus the
ICO container and the favicon pack), `blur-placeholder` (the BlurHash codec and
the `blurDataURL` it writes), `curl` (the shell tokenizer, the request model and
the four writers around it), `domain-inspector` (the address guard, the DoH
transport and the signature table — see below), `bson` (three readers and three
writers over one plain value — see below), `port-scanner` (a TCP connect scan
behind a quota that fails closed — see below), `mock-server` (a node canvas over
a stored graph — see below), `json-server` (a hosted `json-server`: one pure
engine cross-checked against the real package, behind a two-tier size ceiling —
see below), `graphql-server` (the same document served as GraphQL: a schema
derived from the data on every request, executed by `graphql-js` behind a
three-part query guard — see below), `uuid`, `overview`, `preferences`, `seo`,
`observability`.

The three studios are the second worked example of the "lift it the moment a
second tool needs it" rule, and the seam is instructive because almost none of
it was obvious in advance, and because it moved **twice**.

The JSON Server Studio's arrival lifted everything about _owning something
without an account_ — the browser secret, the printable recovery key, the cookie
that holds a capped list of them, the public server key with its reserved-name
list, and the fixed-window throughput counter every public path meters on.

The GraphQL Server Studio's arrival lifted the layer underneath that: the
_document_. `tools/domain/json-document.ts`, `record-id.ts`,
`document-limits.ts`, `document-usage.ts`, `document-format.ts` and
`server-name.ts`, with `tools/types/json-document.ts` as their vocabulary — plus
the three components every studio renders them through
(`json-document-editor.tsx`, `document-usage-bar.tsx`, `server-base-url.tsx`)
and the `hostedServer` message namespace they read. That lift is what makes the
strongest promise either studio makes true: **one `db.json` behaves identically
in both.** Same ids, same coercion, same collection rules, same ceilings, same
sort order. Two copies of `readDocument` would have made that a coincidence
maintained by hand.

What stayed in each module is the part that differs, and only that: the mock
studio's graph, the REST studio's route table and query string, the GraphQL
studio's schema derivation. The JSON Formatter's reader and writer moved on the
same principle a release earlier than they were needed here, and for the same
reason the Base64 encoder did — the _reading_ of what a person pasted is shared,
the tool's own options are not.

Two things deliberately did **not** move, and the line between them is the
useful part. Each studio's launcher and workbench are near-identical React and
are still two files each: unifying them would mean injecting two Server Actions,
two result types, a message namespace, a card and a route — six parameters to
save a layout, which is where an abstraction costs more than the duplication it
removes. And each keeps its own cookie name and its own `usageFull` sentence,
because a visitor at capacity in one studio must not be refused in the other,
and "writes are refused" without naming _which_ operations stopped is a sentence
with no action in it.

The three image tools are the worked example of the "lift it the moment a second
tool needs it" rule. Everything they share — decoding, the four tuned encoder
profiles, Lanczos3 resizing, alpha flattening, the ZIP writer, filename
cleaning, and the bytes-to-base64 loop a `data:` URI needs — lives in
`tools/domain/`. What stays in each module is the part that differs: the
compressor searches for the smallest result, the converter writes the target you
named, the placeholder generator throws away everything but the low
frequencies.

`tools/domain/base64.ts` is the newest lift and shows where the seam goes. The
Base64 tool still owns everything about _reading_ what a person pasted — the
alphabets it names, the whitespace it tolerates, the positions it reports. What
moved is the encoder alone, because a data URI needs the same sextets and none
of the options.

Rules that keep this honest:

- `domain/` must stay framework-free. If a file needs `getTranslations`, it is
  a presenter, not domain.
- `domain/` stores icons and accents as string keys. The UI resolves them
  (`tool-icon.tsx`, `tool-accent.ts`). Never put a React component in a domain
  module.
- No `console.*` in feature code. Use `logEvent` from
  `src/modules/observability/domain/logger.ts`.
- Do not add to `lib/`. It holds `cn` and the Prisma/Supabase clients only.
- Every free-text field carries a ceiling and shows it. Pick `cap` or `warn`
  by what a silent cut would destroy — see **Telling Somebody How Full the
  Box Is**.

---

# Adding a New Tool

Work in this order. Each step has a rule that is easy to violate.

**1. Register it.** Add the id to `TOOL_IDS` in
`src/modules/tools/types/index.ts`, then the entry in
`src/modules/tools/domain/tool-catalog.ts` with `status: "planned"` until it
ships. `href` must be `/tools/<id>` — a test enforces this. Pick an `accent`
from the five brand hues and an `icon` from `ToolIconName`; add a new icon key
to both the union and the map in `tool-icon.tsx` if none fits.

**2. Add copy to both locales.** `tools.<id>.name` and `tools.<id>.description`
in `en.json` _and_ `bn.json`. Missing Bangla keys fail the type check.

**3. Build the domain layer first, with tests.** Pure functions, typed errors
(see `UuidQuantityError`), explicit constants for limits. Get `bun test` green
before writing any UI.

**4. Add Zod schemas** in `validation/` for options, search params, and any
server action payload. Search params use `.catch(undefined)` per field so a
malformed link degrades to defaults instead of a 500.

**5. Build the page.** Server component by default:

- `generateMetadata` from `<tool>.meta` messages, plus `alternates.canonical`,
  `openGraph`, and `twitter`.
- Emit `JsonLd` — `SoftwareApplication`, `BreadcrumbList`, and `FAQPage` when
  the article has an FAQ.
- Generate initial results **on the server** and pass them to the client island
  as props. Never generate in `useState` initialisers — server and client
  produce different values and hydration breaks.
- Close the page with `<RelatedTools toolId="<id>" />` from
  `src/modules/tools/components/related-tools.tsx`, below the article. It picks
  its own suggestions — same category first, then popularity — and renders
  nothing rather than a stub heading when there is nothing to suggest.
- Add `loading.tsx` with skeletons that match the real layout block for block,
  including the three related-tool cards at the foot.

**6. Keep the client island small.** One interactive component per tool holding
state; everything static stays a server component. Long-form content is a
server component, never part of the island.

**7. Write the article after the tool**, using semantic sections with stable
`id`s and a TOC entry. Cap prose at `max-w-[68ch]`; let tables break out inside
`overflow-x-auto`.

**8. Update the repository documentation in the same change.** A tool is not
shipped until the docs stop describing the repository as it was before it. See
**Documentation Is Part of the Change** below for exactly what to touch.

**9. Verify before calling it done.** These four are cheap — always run them:

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --check "src/**/*.{ts,tsx,css,json}"
```

Visual review is the author's job, not an automated one — see
**Running and Verifying Locally** below. Hand off this checklist instead of
launching a browser:

- light and dark
- English and Bangla
- 390px and 1440px
- sidebar expanded and collapsed
- at 390px, `document.documentElement.scrollWidth === window.innerWidth`
  (grid children need `min-w-0` or wide content blows out the page)

---

# Platform APIs That Read the Host

Two platform behaviours look pure and are not. Both break in the same way: the
server render and the hydration pass disagree, so the page flickers or throws.
Both were found building the Timestamp tool.

**Never `new Date(string)` on a value that carries no offset.**
`new Date("2026-07-29T12:00:00")` is parsed against the _host's_ zone. On the
server that is the container's `TZ`, in the browser it is the reader's — the
same string becomes two different instants. Parse the fields yourself and apply
an explicit zone. See `timestamp/domain/parse.ts`; `tools/domain/zone.ts` holds
the wall-clock ↔ instant arithmetic, built on `Intl` alone, and is shared by
every tool that needs it.

**Never build an option list from a runtime enumeration.**
`Intl.supportedValuesOf("timeZone")` returns 419 entries in Bun and 418 in
Node, and browsers differ again. A `<Select>` populated from it renders
different options on each side of hydration. Freeze the list into a literal
array in `domain/` (`tools/domain/time-zone-list.ts`) and catch the
difference where the value is _used_ — `isFormattableTimeZone` probes by doing
the thing, and the orchestrator drops what the local engine cannot render and
says which. The same applies to `Intl.supportedValuesOf` for calendars,
collations and currencies, and to `TextDecoder` labels.

**A `datetime-local` value has no offset either.** It is a wall clock and
nothing more, so it means a different instant depending on who reads it. Parse
the fields with a regex — never `new Date(value)` — and hand them to
`zonedFieldsToEpochMs` with a zone read **inside an event handler**, where there
is only one host to ask. `tools/domain/local-datetime.ts` does both
directions and rejects a rolled-over field rather than letting the arithmetic
absorb it. Where a stored instant has to _prefill_ such a field, derive it
during render behind `useIsHydrated()` — UTC on the server and through
hydration, the reader's own zone a tick later — never from an effect.

`tools/components/date-time-picker.tsx` is the control that speaks that string,
and it is the shape to copy. Its trigger label is formatted from `Date.UTC`
fields **in UTC**, so the typed wall clock renders identically on any host; the
calendar itself — which reasons in local date components and marks the host's
own "today" — lives inside the popover, so it never mounts during SSR and
hydration never sees it.

---

# Telling Somebody How Full the Box Is

Every tool on this site already refused oversized input — a ceiling in `domain/`
and a `z.string().max()` on every Server Action. What none of them did was say
so _before_ the refusal, and a box that accepts a paste and then reports a
failure is indistinguishable from a broken tool. `tools/domain/input-limit.ts`
and `tools/components/input-limit-meter.tsx` are the one implementation.

**Three states, not two.** A field that only speaks when it is full teaches
nobody anything, and one that shows `0 / 60` from the first keystroke is noise
on fifty-nine of them. `readInputLimit` returns `ok`, `near` or `over`, and the
meter renders nothing in the first unless the caller asks for a running count.
The window is a ratio clamped at both ends — 10% of a 20-character alias is two
characters, which is too late, and 10% of a 250,000-character document is
25,000, which is not "nearly" anything.

**It takes a length, not a string.** Some ceilings are UTF-16 units and some are
UTF-8 bytes, and one function over a number serves both. Byte-measured fields
pass `useByteLabel()` as `format`, which also switches the copy off its plural
forms — "1 character left" has no byte equivalent.

**Cap or warn, and the choice is about what a cut destroys.** Both are correct
and using the wrong one is the bug:

- **Cap with `maxLength`** on a short identity field — a name, an alias, a
  hostname, a key, a colour, a header. These are typed or pasted whole and one
  over the ceiling is a mistake, so the browser refusing the keystroke costs
  nothing. Such a field can never read `over`; the meter only counts down.
- **Never cap a content box.** A `db.json`, a curl command, a JWT, a Markdown
  draft, an OpenAPI document: `maxLength` truncates a paste _silently_, and a
  document cut mid-string is not a shorter document — it is an invalid one, or
  worse a valid one that means something else. Show the meter, render the
  failure under the box, and **disable whatever submits it**. A box that says
  "too large" above a button that will happily post it is the same defect in a
  new place.

**The counter goes beside the label, the failure goes under the box.** "How much
is left" is a property of the field; "this cannot be submitted" is a verdict,
and every verdict on this site appears in a `StatusStrip` under its control.
`useInputLimitStatus` shapes one for that strip.

**A live region that speaks on every keystroke is unusable.** The meter carries
`role="status"` only once the state stops being `ok`.

**Where Zod passes a value through, bound its size explicitly.**
`serverActions.bodySizeLimit` is 11 MB app-wide because one tool forwards
photographs, so every action inherits that ceiling — and the mock studio's
`graph` and `body` were `z.unknown()`, which is the right call about _shape_ and
was silently also a decision about _size_. `tools/domain/payload-size.ts` is the
guard, and its two properties are the design: it walks iteratively, because a
ten-thousand-deep array is a payload somebody can post and a recursive walk over
one is a stack overflow rather than a refusal; and it **costs the budget, not
the payload** — an array is charged for its `length` before a single item is
pushed, so refusing a half-million-element paste is bounded work.
`JSON.stringify(value).length > limit` is the obvious version and it serialises
the whole thing first, which is the cost being defended against.

# Remembering Something in the Reader's Browser

`short-links/domain/history.ts` and `short-links/components/use-link-history.ts`
are the pattern for anything a tool has to remember between visits. Three parts, and
each solves a failure the obvious version has:

- **Storage is a parameter with a browser default**, exactly like
  `tools/domain/clipboard.ts`. That is what makes a full quota, a blocked
  profile, and a hand-edited value reachable from a test with no DOM. Reading
  `window.localStorage` can itself throw, so even the lookup is in a `try`.
- **Every read is defensive and total.** Absent, unparseable, an object where an
  array belongs, one bad row among good ones — each degrades to what can still
  be read. A convenience list is never worth throwing a page away for, so the
  parser filters rather than validates.
- **The React binding is `useSyncExternalStore`, not state seeded from an
  effect.** It has a separate server snapshot, so the server render and the
  hydration pass both see an empty list and hydration cannot mismatch; and it
  can subscribe to `storage`, so a second tab stays in step. The snapshot is
  cached at module scope because `getSnapshot` must return a stable reference —
  re-parsing on every call hands React a new array each time and spins forever.

One list per tool, under its own key, because a poster and a campaign link are
two different things to the person who made them even though they are one row in
the database. `historyStorageKey(tool)` is the only place that mapping lives.

If what you are storing is a credential — both short-link tools keep each link's
edit URL, because a one-time link nobody saved is a feature nobody can use —
then say so in the UI, cap the list, and give it a button that empties it. Do it
quietly and the tool is a credential store that never admitted to being one.
It also obliges the surrounding copy to stop overstating the stakes: once the
browser keeps a copy, "shown once, save it now or lose it forever" is no longer
true, and copy that overstates teaches readers to skip the copy that does not.

---

# A Tool That Edits Its Own Input

The URL Parser has two editors over one value: the URL box, and the query
parameter table underneath it. `src/modules/url-parser/` is the shape to copy
whenever a tool offers more than one way to change the same thing.

- **One piece of state; everything else derived.** The URL string is the only
  `useState`. The parts list and the parameter rows come from `parseUrl(url)`
  during render, and a row edit writes back through `applyParams`. Two states
  held in step by an effect is the version that drifts, and it drifts on the
  input nobody tested.
- **A two-way editor cannot sit behind a debounce.** `useDebouncedValue` is the
  default for typed input and it is wrong here: the row inputs are controlled by
  the settled parse, so a keystroke would be reverted for 300 ms and then
  reappear. The rule it comes from is about expensive derivations, and this one
  is a single bounded `new URL()`. Match the debounce to the cost, and say in a
  comment why it is absent.
- **The blank row is not state either.** The table renders `params.length + 1`
  rows, `editParam` appends when the index lands past the end, and
  `buildQueryString` drops a pair with neither half. "Add a parameter" then
  needs no button and no draft object.

`new URL()` is the rare platform API that is safe to call during render on both
sides of hydration — it is specified rather than host-derived, unlike the
enumerations and zone-less dates above. What it _is_ is normalising: lowercased
scheme and host, punycoded IDN, default port dropped, empty path written as `/`.
Tell the reader when that changed their text instead of swapping it silently.

---

# Converting Between Two Syntaxes That Describe One Thing

`src/modules/curl/` is the shape to copy whenever a tool reads one notation and
writes another — and especially when it does both directions.

**Never rewrite one syntax into the other.** A command is parsed into an
`HttpRequest` and the request is written back out; `curl → fetch` and
`fetch → curl` share that model and touch nothing else of each other's. Two
direct translators is two places for "what does `-L` mean" to be answered
differently, and the disagreement only shows up on the input nobody tested. It
also buys the Request tab for free: it is not a second parse, it is the object
both sides were built from.

**The one thing a tolerant parser may not guess is arity.** curl has around two
hundred flags. Guessing that an unknown one takes a value eats the URL; guessing
it takes none promotes its value to one. `flags.ts` records arity even for flags
nothing acts on, precisely so being _ignored_ stays survivable and being
_mis-split_ stays impossible — and the fallback for a flag outside the table
consumes the next token only when it can be neither a flag nor an address.

**Detect the dialect before tokenising, never during.** "Copy as cURL" is three
languages: `{"a":1}` arrives as `'{"a":1}'` from bash, `^"{\^"a\^":1}^"` from
cmd, and `"{`"a`":1}"` from PowerShell. One forgiving pass that tries to satisfy
all three reads two of them wrong and produces a request nobody made. cmd is two
layers in a fixed order — the shell resolves `^`, then curl's own C runtime
resolves `\"` — and conflating them is what makes hand-rolled readers get `^"`
wrong.

**A quoter can be checked by something that is not you, cheaply.** Emit the
command, define `curl() { for a in "$@"; do printf '%s\0' "$a"; done; }`, and
pipe the whole thing to `/bin/sh`. Real word-splitting, no dependency, and it
covers `bash` and `dash` in the same script. Say in the handoff which dialects
that could _not_ reach — cmd and PowerShell have no interpreter on Linux, so
their guarantee is only the round trip through this repo's own reader.

**Round-trip at the model, not at the text.** `-d` and `--data-raw` say the same
thing, so byte equality is the wrong invariant; `parse(emit(parse(x)))` equalling
`parse(x)` is the right one. That test found a real defect nothing else would
have: an empty header emitted as `Name: ` reparses as a _removal_, because
`Name:` with nothing after it is how curl is told to drop a header it would
otherwise add. The spelling that means "send this, empty" is `Name;`.

**Defaults that differ are the bugs nobody sees.** curl does not follow a
redirect without `-L`; `fetch` follows unless told not to. curl sends
`application/x-www-form-urlencoded` with `-d`; `fetch` sends `text/plain` for any
string body, `JSON.stringify` output included. Neither is visible until a server
refuses the request. Both are written out explicitly rather than left implicit —
carrying the _default_ across, not the silence.

**Naming what was dropped is half the tool.** curl is a superset of every target,
so a conversion always loses something, and each language loses a different
third. `notes.ts` takes a capability record per target and turns everything
unsupported into a typed note the UI lists under the output. A `fetch` that
quietly lost `--insecure` looks correct right up to the first self-signed
certificate. The same mechanism carries the _adapted_ cases, which matter just as
much: `-m 15` becoming `AbortSignal.timeout(15000)` is not a loss, but it is not
recognisable either.

**Where being faithful would produce a worse snippet, say so instead.** The
honest translation of "no `-L`" is `redirect: "manual"`, and on Node that is
exactly right. In a browser the same line makes the response _opaque_ — status 0,
headers gone, body unreadable — so a snippet that cannot read its own reply is
the worse answer. There it is left out and the difference becomes a note. Decide
per runtime, and write down which way and why.

**Highlighting a textarea means painting behind it, and the alignment is the
whole job.** `tools/components/code-editor.tsx` is the pattern — it started in
this module and moved to `tools/` whole the moment the BSON converter needed one,
along with `code-block.tsx` and `tools/domain/highlight.ts`. A `<pre>` holds the
coloured copy, `absolute inset-0`, with the textarea's own glyphs set to
`text-transparent` and only its caret and selection left visible. The textarea
stays a real textarea, so undo, IME, autofill and screen readers are untouched.
Four things hold the two in register, and each is a bug if it drifts:

- **One shared metrics constant**, not two class lists that match today. Font,
  size, line height, padding, wrap rule — `CODE_TEXT` and `CODE_PADDING`.
- **Both elements positioned.** An `absolute` child paints above a `static`
  sibling whatever the DOM order, so the textarea needs `relative` too or the
  backdrop swallows every click.
- **`scrollbar-gutter-stable` on both.** A classic scrollbar takes its width out
  of the content box, so the instant the textarea overflows it is narrower than
  the backdrop and every wrapped line breaks a word early.
- **A trailing `"\n"` in the backdrop**, or a value ending in a newline leaves
  the caret on a line the backdrop does not have.

The tokenizer for it is a _different_ tokenizer from the one that reads the
command — `highlight.ts`, not `tokenize.ts` — because the two want opposite
things. The parser resolves escapes and discards quotes; the highlighter must
return every character it was given, in order. That is the invariant to test:
`tokens.map((t) => t.text).join("") === input`, over deliberately awkward input.
And highlighting cannot be debounced when it sits behind a caret, so it needs a
length ceiling instead — above `MAX_HIGHLIGHT_LENGTH` it returns one plain
token, because losing the colour beats losing the typing. Nor can the _language_
be debounced: it follows the live value, or a reader switching notation watches
the backdrop stay a language behind the glyphs for 300 ms.

Adding a language to that file is a scanner and nothing else, and the round-trip
invariant is what makes it cheap — the shared test already loops over
`HIGHLIGHT_LANGUAGES`, so a new member is covered by every awkward input in the
list the moment it joins the union. That is what caught both defects in the TOON
scanner: whitespace emitted twice, and a delimiter inside a quoted value
splitting the string it was quoted to protect. Two rules fall out. **Never split
on a separator before honouring quotes** — the quoting exists precisely because
the separator appears inside values. And **`plain` is a language**, not the
absence of one, so a notation with no structure worth colouring (base64, a
digest) names a value instead of making every caller branch around the
component.

**A hand-rolled reader for a language degrades; it does not fail.** `js-value.ts`
reads the slice of JavaScript a `fetch` init is written in and returns anything
else as `raw` — the source text, untouched. A real parser is a dependency and a
far larger surface for the sake of expressions almost nobody writes. Two traps it
cost: `await` has to be skipped as a prefix or `const r = await fetch(…)` comes
back as one opaque expression with the call buried inside it, and a call inside a
declaration is still a call, so the scanner has to walk the value tree rather
than only the statement list.

# When to Take a Format on Trust

`src/modules/bson/` reads and writes three notations of one data model, and it
does not implement any of them. That is the opposite call from
`domain-inspector`'s signature table, and the line between them is worth
stating: **implement it yourself when the output is only ever read here; depend
on the reference implementation when somebody else has to read it.** A wrong
pattern in a fingerprint table is one wrong row on one page. A hand-rolled
Decimal128 or a re-reading of the TOON spec produces bytes that only this site
can read, which is precisely what a converter is not for. Both dependencies were
also checked before being taken: zero transitive dependencies each, and both
maintained by the format's own owner.

What is still ours is the part worth owning.

- **N formats cost N readers and N writers, never N² translators.** `convert.ts`
  parses whichever notation arrived into one plain `JsonValue` and writes that
  value out in whichever was asked for — the same rule the cURL module follows,
  scaled up. Six conversions, four codecs, and BSON → TOON cannot develop its own
  opinion about what a date is because no code path connects the two directly.
- **Where the model runs out, name the bridge.** BSON has twenty types and JSON
  has six, so the hub value is _Extended JSON_ — MongoDB's own spelling of those
  types as ordinary JSON objects. That is what makes TOON carry an ObjectId for
  free: TOON encodes the JSON data model, and Extended JSON is inside it.
- **A library's defaults are not your guarantee.** `deserialize` promotes a
  `Double` to a JavaScript number and `EJSON.deserialize` promotes a
  `$numberLong` back to one, so the obvious four-line round trip loses two types
  and silently rewrites the third. `promoteValues: false` on the way out and
  `relaxed: false` on the way in are what make canonical mode byte-exact. Both
  constants carry the reason at their definition, because both look like
  paranoia and neither is.

The two rules that generalise past this module:

**Earn a lossiness warning per document, or do not show one.** Relaxed Extended
JSON loses a `Double` holding a whole number and any int64 past ±2⁵³ — and
preserves everything else, which is most real documents. A standing "this may be
lossy" banner is therefore wrong most of the time, and a warning that is usually
wrong is one people stop reading. `readBson` instead writes the relaxed result
back to BSON and compares bytes with what arrived, so the note appears only when
it is true. One extra serialize is a cheap price for a warning that means
something.

**An engine's error message is host-derived, so it cannot be rendered from a
derived-during-render value.** `JSON.parse` says `Unexpected token '}' … at
position 7` on V8 and `JSON Parse error: Unexpected token '}'` on
JavaScriptCore. Putting either in the output makes the server pass and the
hydration pass disagree — the same trap as `Intl.supportedValuesOf`, arriving
from a direction that looks nothing like it. So `json-codec.ts` returns a typed
`invalid_json` and nothing else, and the copy points at the JSON Formatter,
which owns a hand-written parser and can name the line. `ToonDecodeError` is
safe to render for the mirror reason: it comes from a pinned dependency, not
from the host.

# One Short Link Layer, Two Tools

`src/modules/short-links/` owns every re-pointable link on this site: slug and
alias generation, edit tokens, link passwords, schedule windows, the redirect
decision, and the single `short_links` table. The QR tool's dynamic codes and
the URL Shortener are the same row behind the slug and differ only in which pair
of paths a view is built from — `TOOL_PREFIXES[tool]`, keyed by
`SHORT_LINK_TOOLS`.

What that buys, and what to preserve:

- **One `decideRedirect`.** Both `/q/[slug]` and `/s/[slug]` are ten lines over
  `resolveShortLink`, so a window or a password cannot behave differently
  depending on which address was shared. A third feature adds a prefix pair, not
  a second route handler with its own idea of what expired means.
- **Read and count are two statements.** A gated link is read twice — once to
  discover it needs a password, once after the visitor types it — and a single
  counting read would score that as two visits. `countVisit` still does its
  `increment` in the database, so concurrent visits cannot lose one.
- **Every refusal keeps its own name.** `missing`, `pending` and `expired` reach
  the tool page as separate states, because "this expired" and "you mistyped it"
  are different things for the reader to do next.

---

# Verifying a Codec Against Something That Is Not You

A generator that also owns its own tests proves nothing. A wrong entry in a
table, or an off-by-one in an interleaver, still produces output that looks
exactly like the real thing — self-consistent, plausible, and unreadable by
anything else. The QR encoder's placement loop skipped the timing column by one
column too few, and every structural assertion written about it passed.

What caught it was a **round trip through an independent implementation**. The
matrix is rasterised into an RGBA buffer by a pure function and handed to
`jsqr`, the same decoder the reader half of the tool uses. One test per version
and error-correction level, so every row of the block tables and every
alignment-pattern layout is actually exercised rather than assumed.

Two things that made the failure legible once it appeared:

- **Test the whole domain, not a sample.** The bug only broke three of the
  160 version/level pairs — the ones with a single error-correction block and
  the least parity. A handful of hand-picked payloads would have shipped it.
- **When output decodes on some inputs and not others, suspect placement before
  arithmetic.** Higher error-correction levels were masking a systematic
  corruption; the levels that failed were simply the ones with no redundancy
  left to spend on it.

The Image Converter's `.ico` is the third instance, and it names the cheapest
form of the rule: **the independent implementation can be three programs already
on the machine.** Every size combination is written out and read back by
`file(1)`, ImageMagick's `identify` and Pillow — the last of which seeks to each
offset the directory records and decodes what it finds there, which is precisely
the round trip a wrong offset or length would break. A structural assertion
written against your own writer cannot do that.

It also cost two rounds of chasing assertions that were wrong while the file was
right, which is its own lesson: **when an independent reader disagrees with you,
find out what it actually said before changing the code.** `identify` labels an
ICO frame by the codec inside it (`PNG 16x16`), not by the container; `file(1)`
describes only the first couple of directory entries and stops; and Pillow
reports a PNG that OxiPNG losslessly reduced from RGBA to RGB-plus-`tRNS` as
mode `RGB`, which looks exactly like lost transparency until you convert and read
the alpha extrema. Three "failures", zero defects.

Reach for the same shape whenever a tool emits a format somebody else has to
read: encode, decode with a different implementation, assert you got back what
you put in.

The Diff Checker's unified patch is the second instance, and it sharpened the
rule twice. The independent implementation does not have to be a library — it
can be a **program already on the machine**. Piping every generated patch
through `patch(1)` in a throwaway script found two shapes of input that
`git apply` would have rejected outright, and a hand-written applier in the test
file had passed both, because it had inherited the assumption it was supposed to
be checking.

That assumption is the second lesson, and it generalises past patches: **a
format's idea of a line may differ from yours by exactly one.** The row model
shows a text ending in a newline as having a final empty line, because a reader
expects to see it. A unified diff counts one line fewer and marks any side whose
last line lost its ending with `\ No newline at end of file`. Either model alone
is coherent; a hunk header counted in one and applied in the other is a patch
nothing can read. When you emit a format, write down which model each side of
the boundary uses before writing the converter — and note that a _context_ line
means identical in both files, terminator included, so a final line the two
sides end differently has to be printed as a removal and an addition instead.

The BlurHash codec is the fourth instance, and it adds the part none of the
others had to face: **the reference implementation is also code, and some of
what it does is a bug.** `blurhash@2` opens its decoder with `punch = punch | 1`
— which reads like a default and is not one, since it truncates to an integer
and sets the low bit, so 2 and 2.5 both become 3. Its encoder takes
`Math.max` of the _signed_ AC coefficients where the C reference takes the
largest magnitude.

Matching it blindly ships its defects; ignoring it costs the byte-exact
comparison that makes the test worth running. So decide per behaviour, and write
down which way and why:

- **Match anything that changes the bytes other people read.** The signed
  maximum is matched, because a hash that differs from what `blurha.sh` and
  every npm consumer produce is a worse answer than one that spends a fraction
  of a quantiser step. Matching also means matching the _arithmetic_: the
  encoder walks columns-outside-rows because the reference does, and
  floating-point addition is not associative, so the other order lands a hair
  away and rounds a byte over a boundary. `Math.trunc(x + 0.5)` is kept for the
  same reason — it is `Math.round(x)`, and `Math.round(x + 0.5)` is not.
- **Never match a defect in a control the reader turns.** Punch is implemented
  correctly here, and the cross-check simply does not compare at any value where
  the reference mangles it — 1, where the expression is a no-op, still exercises
  the entire basis loop for every pixel. The tool's own tests then pin the
  behaviour the reference cannot: three distinct punches render three distinct
  pictures.

The comment at each of those three lines says which rule it is following. A
constant that looks wrong and is deliberate needs that, or the next reader
"fixes" it and the cross-check goes red with no explanation of what it was for.

The JSON Server engine is the fifth instance, and it moves the rule from
_formats_ to _behaviour_. Nothing here is byte-exact; what has to match is what
a request returns. `src/modules/json-server/` reimplements `json-server` v1, and
160 hand-written tests passed while **seven** behaviours were wrong — every one
of them a case where a fixture would work locally and behave differently once
hosted, which is the single defect a compatibility layer cannot have:

- `sort-on` compares strings with **`localeCompare`**, so `"a title"` precedes
  `"Tenth"`; a code-unit comparison puts every capital first.
- and it sorts **falsy values last ascending, except `0`** — so `?_sort=draft`
  leads with the drafts.
- `_per_page=0` clamps to **one**, not to the default of ten.
- `_per_page` **alone is not pagination**; the envelope needs `_page`.
- `_embed` runs **before** filtering and sorting, which is the only order that
  lets `?_embed=post&_sort=post.title` reach the embedded field.
- `_embed=post` **pluralises** to find `posts`. Reading `document["post"]` finds
  nothing on every real fixture.
- `DELETE` **nulls the foreign keys** pointing at the deleted row, whether or not
  `_dependent` was passed.

Three rules generalise from it.

**The independent implementation can be the library you are cloning, driven
without its server.** `npm i json-server` in a scratch directory, import its
`Service` class and the query-string mapping out of its own `lib/app.js`, and
run both engines over one document. No port, no dependency added to this
project, and 74 request/response pairs compared in a file that is deleted
afterwards. What stays in the repository is `tests/reference-parity.test.ts` —
the _results_, pinned, with each one saying which behaviour it caught.

**Diverge only on malformed input, and say so.** The line this module draws is
worth copying: a well-formed query behaves exactly as the reference does, and
the three deliberate differences are all about input no working client sends — a
`_where` that is not JSON and an unknown `:operator` are **400s** here where the
reference silently drops the filter and returns the whole collection, and a bare
`{"views": 100}` clause is honoured here where the reference matches nothing.
The first two are refusals, the third is strictly additive. None of them can
change what a correct client sees.

**Matching a defect is sometimes right.** A nested `_where` clause against a
field that is not an object _passes_ in the reference — a filter matching rows it
was asked to exclude. That is matched anyway, and the comment says why: this is a
clone, and imposing a judgement about which behaviour is nicer is exactly what
makes a hosted fixture disagree with a local one. Compare the BlurHash punch
above, where the defect was in a control the reader turns and matching it would
have been wrong. The question is not "is this a bug" but "would diverging make
the two disagree on something somebody actually does".

# A Byte-Exact Codec Can Still Be a Bad Tool

The BlurHash encoder was verified against the reference across all 81 detail
settings, character for character, and the first thing a reader said about the
page was that the blur did not look like their picture. Both were true. A
cross-check proves you implemented the format; it says nothing about whether the
tool built on it is any good, and no amount of staring at the codec finds a
defect that is not in the codec.

**Render the output and look at it.** `Read` displays an image, so a throwaway
script that writes PNGs is a real review: encode the picture, decode it, write
both, and put them side by side. That is what found all three of the problems
below, and it took less time than the round of theorising it replaced. A minimal
PNG writer is forty lines over `node:zlib`, Pillow and ImageMagick are already
on the machine for reading real photographs in, and none of it belongs in the
repository afterwards.

**Measure against the right reference, or the number lies.** RMS against the
sharp original barely moved between a good blur and a bad one — the error is
dominated by the band limit both share. Against a Gaussian of the source, the
same change showed up properly. A metric that cannot separate the two states you
are choosing between is worse than no metric, because it reads as evidence.

The three defects, and the rules they leave behind:

- **Do not stretch a sampled function; evaluate it.** The preview was the
  32-pixel `blurDataURL` in an `<img>`, blown up twenty times. That is bilinear
  interpolation between 32 samples rather than the curve they came from, and it
  flattened the difference between 4 × 3 and 8 × 6 — so the one control that
  decides whether the blur resembles the picture appeared to do nothing.
  `PREVIEW_EDGE` paints the hash at display size instead. The shipped artefact
  stays small; the thing on screen is the truth about it.
- **A default that ignores the input is a bug with good manners.** A flat 4 × 3
  grid over a 16:9 photograph starves the axis that carries the picture.
  `fitComponents` matches the grid to the aspect ratio on `log(x / y)`, so a
  portrait gets the mirror of its landscape rotation, and a budget picks how much
  to spend. The budget is 28 because that is where three rock formations stop
  merging into one red band — a number read off the output, not chosen for being
  round.
- **A working size chosen for speed is a quality setting in disguise.** The
  encode was downscaling to 128 px, which is defensible, and 256 px costs 31 ms
  at 9 × 9. Measure the thing you are trading against before picking the trade.

When a reader says the output is not good enough, take it as a claim about the
output. Reach for the renderer before the debugger.

# When the Platform's Own Encoder Is Not Good Enough

`canvas.toBlob` writes a JPEG. It is also the browser's default writer with one
knob, no way to ask for trellis quantisation, progressive scans, sharp YUV, or
anything else a real encoder exposes — and `drawImage` at a smaller size is
whatever the GPU driver does, which on a large reduction is a box filter.
`tools/domain/image-codec.ts` is the shape to copy when the platform API is
present but the output is the product: reach for the actual codec, compiled to
WebAssembly. It lives in `tools/` rather than in either image tool because both
of them drive the same four encoders, and two copies of the trap notes below is
one copy too many.

- **Import each codec on demand, inside the function that uses it.**
  `await import("@jsquash/avif/encode")` means a reader who only ever writes
  WebP never downloads libaom. A static import at the top of
  `tools/domain/image-codec.ts` would pull every encoder into the island's
  first chunk.
- **The wasm is resolved by the bundler, not by you.** Every jSquash module
  locates its binary with `new URL("x.wasm", import.meta.url)`, which webpack
  and Turbopack both understand as an asset reference. Copying `.wasm` files
  into `public/` and passing `locateFile` is the workaround for a bundler that
  cannot do this; ours can, so do not.
- **Import the single-threaded codec directly, never the package entry point,
  when the package has a multithreaded twin.** This one cost a build.
  `@jsquash/avif/encode` and `@jsquash/oxipng/optimise` choose between a
  single-threaded and a pthread/rayon build _at runtime_, so they import both —
  and `avif_enc_mt.js` and `oxipng/codec/pkg-parallel/…/workerHelpers.js` are
  the only two files in the whole dependency that construct a `new Worker`. A
  worker constructor makes the bundler open a nested compilation, and that
  deadlocked `next build`: five processes parked in `ep_poll`, zero CPU, zero
  I/O, forever. Neither multithreaded build could ever have run — both are
  gated on being inside a worker, and this runs on the main thread — so
  `@jsquash/avif/codec/enc/avif_enc.js` and
  `@jsquash/oxipng/codec/pkg/squoosh_oxipng.js` give byte-identical output with
  no compilation that hangs. MozJPEG, libwebp and the resizer have no worker
  and are imported normally.
- **A hung build and a slow build look nothing alike — measure before you
  guess.** Expensive bundling pegs CPU. Read `/proc/<pid>/io` twice a few
  seconds apart: if `read_bytes` and `write_bytes` have not moved and nothing
  new has landed in `.next`, it is deadlocked, and no amount of waiting or
  tuning will finish it. Bisect by moving the suspect route out of
  `src/app/tools/` and building — that is a one-minute answer.
- **Copy the bytes out of wasm memory before returning them.** `.buffer` on
  what a codec hands back is the module's whole linear memory, and the next
  file in the batch overwrites it. The package entry points returned that live
  view; `view.slice().buffer` is what makes a queued result still be the image
  it was when it finished.
- **`bun test` cannot reach any of it** — the codecs need `ImageData` and fetch
  their binary by URL. Test the pure layer (`tools/domain/pixels.ts`,
  `tools/domain/filenames.ts`, `tools/domain/archive.ts`, and each tool's own
  `options`/`targets`, `savings`, `ico`, `icon-layout`, `favicon`) and verify the
  codecs in a throwaway Node script that compiles the `.wasm` itself and passes
  it to each package's `init(module)`, then check the output with something that
  is not you: `file`, ImageMagick's `identify`, Pillow. That is the same rule as
  the QR encoder, applied to four formats at once — and it is what proves an
  option profile is _accepted_, not just plausible.
- **Say what the re-encode destroys.** Decoding to pixels drops EXIF, GPS and
  the colour profile, and _applies_ the orientation tag rather than dropping it
  — skip that last step and every phone photograph comes back sideways. All
  three belong in the copy, not only in the code.

Two smaller rules the batch queue settled:

- **Nothing encodes until the reader asks, and a finished row is finished.**
  Picking files fills the queue and stops there; the batch button is what starts
  work, and it runs **only the rows that have no result yet**. A result already
  in hand is never replaced by a batch press, because dropping a second picture
  in at a different quality is not a request to redo the first one — and on a
  queue of twenty that mistake is twenty encodes the reader did not ask for.
  Redoing one is a per-row button, shown only while that row is stale.
  `needsWork` in `domain/` is that whole rule, and it is unit-tested.
- **Staleness is derived, not stored.** `optionsSignature(options)` is written
  onto a row when its result is produced; a row whose signature no longer
  matches the panel is dimmed and offers "compress again". Nothing is silently
  re-encoded, and there is no `isStale` flag to keep in step. What is dimmed is
  the row, never the summary — every file counted there is one the reader keeps,
  whatever the panel says now. Build that signature from **only the options the
  current target actually reads** —
  the converter's version appends the quality, the size cap and the icon sizes
  each behind its own `…Applies(target)` predicate, so nudging the quality
  slider while PNG is selected cannot dim a row it could not have changed. The
  same predicates disable the control, so there is one answer to "does this
  setting apply", not two that can drift.
- **Work the queue sequentially and say which file you are on.** Running every
  encode at once holds every decoded image in memory simultaneously, which is
  how a tab dies halfway through a batch — four bytes a pixel is the real cost,
  not the file size. Sequential work is also the only way the progress count is
  true.
- **A row may produce more than one file, and the ZIP layout has to say so.**
  The favicon pack is seven files from one picture. `buildArchivePaths` is the
  whole rule: a row with one output stays at the archive root, a row with
  several gets a folder named after its source, and the flat list then goes
  through `uniqueFilenames`. Flatten it instead and five packs arrive as
  `favicon.ico` through `favicon-5.ico`, which tells nobody which picture each
  came from. Return the pack as its members, never as a nested ZIP — the row's
  own download button is what packs a single reader's copy.

# Redirecting, and What a Route Handler Is For

`/q/<slug>` and `/s/<slug>` are the only Route Handlers in the repository, and
the exception proves the rule: the client is a phone's camera app or somebody
else's browser following a link, there is no UI to render, and what it needs is
an HTTP redirect carrying headers a page cannot set. They are ten lines each
over `resolveShortLink`, and every header is deliberate:

- **`302`, never `301`.** A permanent redirect is cached indefinitely by every
  browser that followed it once, which is the exact opposite of what a
  re-pointable link is for — and it would outlive an expiry window outright.
  `Cache-Control: no-store` for the same reason.
- **`X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`.** The
  destination belongs to whoever created the link. This origin lends it none of
  its ranking, and the destination learns nothing about the visit.
- **Validate the slug before the query and the target before the header.** The
  first keeps a scripted walk of the keyspace away from the database; the second
  is because a stored value becoming a `Location` header is not a place to
  assume anything.
- **A password gate is a page, not a header.** `/unlock/<slug>` renders from the
  slug alone; the destination stays on the server until the action verifies the
  password. Anything that needs words on it does not belong in a route handler.

A user-creatable redirect is an abuse surface before it is a feature. Creation
sits behind Turnstile, destinations are `http:`/`https:` only, aliases that read
like a lure (`login`, `verify`, `secure`, …) are reserved, and a short link may
not point at another short link on this host — on either prefix. Without all
four, the service is a phishing host that happens to shorten URLs.

# Fetching Something the Reader Named

`src/modules/domain-inspector/` is the shape to copy whenever a tool reaches a
host chosen by whoever is typing. It is a different problem from calling a
worker whose URL is in the environment: there, the destination is ours. Here it
is a stranger's, and the tool is an SSRF surface before it is a feature.

**Resolve first, then connect to the address you checked.** Checking the _name_
proves nothing — `metadata.attacker.example` is a perfectly public name that
resolves to `169.254.169.254`. And checking the name's addresses and then
connecting by name re-resolves it, so a record with a one-second TTL can answer
publicly for the check and privately for the connection. `address-guard.ts`
returns a list of addresses rather than a boolean for exactly that reason, and
`tls.ts` connects to `host: address, servername: hostname` while `http-probe.ts`
pins the same address through the `lookup` option. `fetch` cannot be told which
address to use, which is why the page probe is `node:https` by hand.

**Every redirect hop is a new host and a new decision.** Following redirects
automatically hands the decision to whoever wrote the `Location` header. The
probe follows them itself, guarding each one, capping the chain, and capping the
body — 512 KB of a page is every signature worth having and none of the
bandwidth this server would otherwise spend on a stranger's behalf.

**The range list is longer than the three everybody remembers.** Loopback and
RFC 1918 are the obvious ones. What actually gets used is `169.254.169.254`, and
what gets missed is the IPv4 address hiding inside an IPv6 literal — a
`::ffff:127.0.0.1`, a NAT64 `64:ff9b::`, a 6to4 `2002:`. `domain/ip.ts` unpacks
all three and classifies the embedded address, and it is strict where the
boundary is fuzzy: an octal-ambiguous `010.0.0.1` is rejected rather than
normalised, because an address two resolvers disagree about is precisely what a
filter exists to catch.

**Say the tool is not private, in the tool.** Everything else here runs in the
browser and the site says so on its front page. One that cannot must carry that
in its own copy — what is sent, to whom, and what the inspected host will see in
its log — rather than leaving the site-wide promise to cover it.

**A signature table is code, not a dependency.** Detecting what a site runs is a
list of patterns and something to run them over headers, cookies, markup and
delegation; every published Wappalyzer-shaped package is either unmaintained —
`wappalyzer-core` says so in its own npm description — or arrives with a
headless DOM and an HTTP client attached. `domain/fingerprints.ts` is data in
`domain/`, matched by a pure function, and unit-tested against fixtures. Two
rules keep it honest: **no `g` flag on any pattern**, because a `RegExp` with
`lastIndex` is module-level mutable state shared by every request the server
handles; and **every entry carries a licence**, SPDX or the literal
`Proprietary`, because "what is this built on" and "may I build on it" are the
same question asked twice.

# Building the Thing the Guard Was Written Against

`src/modules/port-scanner/` opens a TCP connection to a port on a host somebody
typed. The address guard's own comment names that as the abuse it exists to
prevent — "use this server as a port scanner with this site's reputation
attached" — so this is the one module in the repository where the guard is
load-bearing rather than precautionary. Everything below follows from taking
that seriously rather than from the feature being hard.

**Name the property you cannot keep, in the tool, above the controls.** This
site's promise is that nothing is uploaded. A page cannot open a raw socket, so
a port scan has to run on the server, and the host being scanned sees _our_
address in its logs. That makes the tool an attribution-laundering service by
default. The disclosure panel therefore sits above the form, not in the article
underneath it — a reader deserves to know whose name lands in the target's log
before they press anything, not after.

**A limiter that can fail open is not a limiter.** Every other degradation on
this site falls toward doing the work: no Turnstile key and a tool renders
disabled, no database and the shortener says so. `spendQuota` inverts that. No
`DATABASE_URL`, no `PORT_SCAN_IP_SALT`, an unreachable database, a thrown
transaction — every one of them **refuses the scan**. Decide which way a gate
fails by what happens when it is bypassed, and here that is an unmetered
scanning service.

- **In Postgres, not in memory.** On serverless a per-process counter resets on
  every cold start and each instance counts separately. Shipping one under the
  name "rate limit" is worse than shipping none, because it stops anyone
  looking again.
- **Read and write in one transaction.** Two visitors behind one address arrive
  together; a read-then-write lets both see nine and both write ten.
- **Spend the allowance even when the scan fails.** A refused scan that costs
  nothing is a free retry loop, and retrying is what an abuser does.
- **Store a salted hash of the address, never the address.** The row answers "is
  this the same caller" and nothing else. Unsalted, a table of SHA-256 digests
  of IPv4 addresses is reversible by brute force in seconds — there are only
  four billion. The salt is a secret for that reason, and rotating it resetting
  every window is the correct failure.
- **A fixed window, not a sliding one.** Sliding needs every timestamp kept,
  and a per-scan history of who scanned when is a log this site has no business
  holding. The cost — a caller can spend the tail of one window and the head of
  the next — is written down in `domain/quota.ts` rather than discovered.

**Order the gates by what each one costs.** Shape, syntax and port parsing are
free and local, so a typo costs no challenge, no database write and no packet.
Turnstile comes before the quota, or a script burns a stranger's allowance by
replaying their address without solving anything. The quota comes before the
network, because it is the only gate that limits _volume_ — everything above it
refuses one bad request, and this is what refuses the thousandth good one.

**Say what the tool refuses to do, and mean it.** No SYN scan, no banner read,
no version probe: the socket is opened, the handshake observed, and it is
destroyed without a byte crossing it. The service column is a static table of
what each port is _registered_ for, so a web server on 22 is labelled SSH and
the label is wrong — which the copy says, because the alternative is
fingerprinting. There is also deliberately no "known attack ports" preset:
checking your own host for a backdoor port is legitimate and the custom field
does it, but offering it as one click against any address somebody types is a
tool for finding other people's compromised machines.

**A third state is not a detail.** Open means the handshake completed; closed
means a reset came back, which took a reachable machine to send; filtered means
nothing came back at all. Most hosted checkers fold the last two together, and
that is a false statement about the network — one of the tools this was
specified against prints `CLOSED` with a `timeout` badge beside it. Where a
measurement has three outcomes, three is what the UI shows, and a scan that
comes back entirely filtered gets a sentence saying nothing answered rather
than being read as a clean bill of health.

**Concurrency is a politeness setting before it is a speed one.** Opening every
socket at once looks exactly like a SYN flood from the far end, and that is how
a server's address gets blocked by the networks it most needs to reach. Sixteen
at a time, 128 ports at most, and an absolute deadline that reports whatever is
unfinished as `filtered` — because a serverless function killed at its own limit
returns nothing at all.

# A Tree Editor Over a Recursive Union

`src/modules/mock-server/domain/value-edit.ts` and its `ValueRow` component are
the shape to copy whenever a reader has to build a nested structure without
typing its syntax.

**Every operation is a pure function on a path, and the component is a
renderer.** Add, remove, rename, duplicate, reorder, change kind — each is a
function taking `(root, path, …)` and returning a new root, so the whole
interaction surface is unit-tested with no DOM. A path is a list of _steps_
rather than a dotted string, because a tree over a union descends in several
different ways — into an object field, into an array's item template, into one
branch of a choice — and a string would have to encode which, badly.

**A write to a path that no longer fits returns the tree unchanged.** A render
and a click are separated by time, so a row can be removed by one action while
another is mid-flight. Losing that edit is a far better outcome than throwing
away the document.

**Say when the escape hatch is lossy, and refuse rather than guess.** A "code
view" beside a visual editor is right — the rule that a builder must not trap a
power user has not changed — but a tree containing generated values has no
literal spelling, because there is no JSON that means "a different name on every
call". So `isAllStatic` decides whether the JSON tab is an editor or a viewer,
`toJson` returns `null` rather than inventing something for the dynamic case,
and the UI says which one it is. Most tools in this shape are quietly lossy
exactly here.

**`fromJson` has to produce real nodes, not one opaque blob.** Pasting JSON that
comes back as a single unopenable value is what makes most code views one-way.

**Injected, not imported, when a dependency is large and server-only.**
`@faker-js/faker` is ~3 MB and `domain/` is reachable from the client bundle, so
the registry holds ids and metadata while the call itself arrives on
`ExecutionContext` from a `server-only` module — the same seam `clock` and
`random` already use. Ids are a literal union and carry no dots, because each
becomes a `next-intl` message key and a dot is that library's namespace
separator.

**Verify a registry against the library it names.** Fifty-one hand-written
`"person.fullName"` strings are fifty-one chances to be wrong, and a typo
degrades to `null` at runtime rather than failing a build. A throwaway script
that imports the real package and calls every entry is a minute's work and is
the same "check against something that is not you" rule the QR encoder and the
ICO writer follow.

**Seed the generator; never reach for `Math.random`.** It is unseedable in every
engine, which makes reproducibility impossible — and reproducibility is what
turns a mock into a test fixture. `sfc32` behind an avalanche hash of a string
seed is fifteen lines. Keep it away from anything that must be unguessable:
credentials still come from `crypto.getRandomValues`.

# Suggesting What Somebody Could Type

`mock-server/domain/suggest-path.ts` and `components/path-picker.tsx` are the
shape to copy whenever a free-text box has a knowable set of good answers. The
box in question asked for a path into a request — `avatar.contentType` — and
nothing on the page said what a request to that route contained, so the only way
to fill it in was to already know.

**A suggestion has to carry how sure it is.** A route's `:name` parameters are
exact and complete. A body key seen in the last twenty-five requests is true of
those requests and says nothing about the next one. A header from a list of ones
people usually send is a guess. Rendering all three identically is worse than
offering none, because it teaches readers to trust the guesses — so every entry
carries an `origin` and every row is labelled with it.

**Do not derive from traffic what you can derive from the definition.** Path
parameters come from `parsePathPattern`, variable names from the graph's own
`setVariable` nodes, and the three properties of an upload from this server's own
multipart parser. Each is exact, free, and available on a route nothing has ever
called — which is precisely when somebody is building it.

**Send the keys, not the rows.** The observed half is reduced to paths on the
server. The alternative ships hundreds of request bodies to the browser to walk
them there: megabytes instead of hundreds of bytes, and a body the feature has no
use for crossing the wire. Whatever gate guards the source guards this too.

**Answer the empty case per reason.** "Nothing matches what you typed", "this
route has never been called" and "cookie names are not recorded" lead somewhere
completely different. One shared "no suggestions" is the same dead end the plain
text box was. Where a fact is _structurally_ unavailable — the cookie header is
redacted before a log row is written — say so, rather than implying it will fill
in later.

**It stays a text box.** The list narrows beside the caret; it never constrains
what may be typed, because the commonest moment to need it is while building
against a request that has not been sent yet.

Two mechanics that are easy to get wrong:

- **Lay the list out in flow, not floated,** when the box lives in a scrolling
  pane. An `absolute` dropdown is clipped by the rail's `overflow-y-auto` the
  moment the row sits near the bottom, and a portal needs position tracking
  against a pane that pans, zooms and resizes. In flow it cannot be clipped or
  mispositioned. It does mean the component renders a **fragment** — the box and
  a `basis-full` sibling — so it only makes sense inside a `flex-wrap` row.
- **Swallow `Escape` while the list is open.** Base UI's dismiss hook listens for
  it on `document`, so an unswallowed press shuts the whole dialog instead of the
  list. `stopPropagation` on the synthetic event reaches it because React's root
  listener sits below `document` and the hook binds in the bubble phase — check
  that before relying on it, since a capture-phase listener could not be stopped
  this way.

And do not debounce it. The repo's default for typed input is 300 ms and it is
wrong here for the same reason it is wrong in the URL Parser: this is a filter
over a few hundred strings already in memory, and a list lagging a third of a
second behind the caret reads as broken. Match the debounce to the cost.

# Letting a Stranger's Configuration Reach the Network

`src/modules/mock-server/` ends with a node that opens a connection to an
address whoever built the graph typed. It was built **last on purpose**, and the
ordering is the transferable part: when a feature turns user configuration into
an outbound request, ship everything else first and let the guard stack be the
gate on the feature rather than a follow-up ticket.

**Close the surface by construction, not by a flag.** `ExecutionContext.outbound`
is optional, and a context built without it _cannot_ make a request — the node
returns `unsupported_node`. The serve path wires it in only when the stored graph
actually mentions the node. There is no boolean anybody can forget to check,
because the capability is absent rather than disabled.

**Order the gates by cost.** URL shape is a regular expression, so it runs first
and a typo costs nothing. The per-execution counter is a local integer. The
quota is a database write and runs last, because it is the only one that bounds
_volume_ — everything above it refuses one bad call and this refuses the
thousandth good one. It fails closed, exactly like the Port Scanner's.

**Every redirect hop is a fresh decision.** `guardedFetch` follows them by hand
because a public URL that 302s to `169.254.169.254` defeats a check done once.
And only the first hop carries the body: a 301 on a POST is followed as a GET by
every real client, and re-sending a body to a host the author did not name is
precisely what should not happen.

**Cap a response while it streams.** Reading it all and measuring afterwards is
how a four-gigabyte reply kills the process.

**Decide what comes back, not just what goes out.** Forwarding an upstream's
`set-cookie` into a mock's own response would launder somebody else's session
through this origin. Four headers are carried; everything else is dropped. The
outbound direction drops `authorization`, `cookie` and `host` for the mirror
reason, and any header value containing a newline, which is request splitting.

# A Ceiling Somebody Can Come Back From

`json-server/domain/constants.ts` holds **two** size limits, and the gap between
them is the design rather than an accident: `MAX_UPLOAD_BYTES` (900 KB) bounds
what may be pasted in, `MAX_DOCUMENT_BYTES` (1 MB) is where writes stop. Three
rules fall out, and they apply to any tool that stores something a stranger can
grow.

**A resource created at its own ceiling is full before its first use.** Were the
two numbers equal, the first thing a visitor met after creating a server would be
a refusal. The gap is the room to actually use the thing.

**Leave a way out, and make sure it is a way out of the thing that is stuck.**
`isGrowingMethod` refuses `POST`, `PUT` and `PATCH` at the ceiling and
deliberately lets `DELETE` through, so a full server can always be emptied by the
person who filled it. A limit that refused every write would be a trap whose only
escape is discarding the whole document — and the difference is one line in a
set of methods, which is precisely why it is easy to get wrong.

**Warn before you lock.** A limit somebody meets with no notice reads as a fault
in the tool. `DOCUMENT_WARN_RATIO` turns the usage bar amber at 80% and the copy
names the remaining bytes, so the lock is something they saw coming. And when it
does lock, the copy says _which_ methods stopped and _what to do_ — "full" alone
leaves somebody with a service they believe is broken.

Two mechanics worth copying. The gate reads a **stored** `sizeBytes` column
rather than measuring the document, so guarding a write costs a column and not a
serialisation of the megabyte being guarded. And the gate lives in the **pure
engine**, not in the repository, so "what happens at the ceiling" is one branch
covered by the same unit tests as every other route rather than something only
reachable with a database.

# Answering on a Route Somebody Typed

`src/modules/mock-server/` serves HTTP responses whose shape a stranger
authored, on addresses a stranger chose. Two things in it generalise past the
studio.

**Route matching has three answers, not two.** A path that exists under another
method is **405 with an `Allow` header**, and it is a different fact from a path
that does not exist. Most hosted mock servers fold them together, and a client
debugging an integration then cannot tell a typo from a missing handler. HEAD
falls through to GET with the body stripped, because HTTP defines it that way
and making authors maintain both is two things to keep in step. An undefined
`OPTIONS` is answered from what the path supports, because it is a preflight.

**Rank on a number computed at write time, never by parsing at read time.**
`specificity` is a base-3 number, one digit per segment — 2 static, 1 parameter,
0 wildcard — read left to right and **right-padded to `MAX_PATH_SEGMENTS`**. The
padding is the part that is easy to miss and is what makes patterns of different
lengths comparable, which they must be: a wildcard pattern is always shorter
than the paths it matches. Two consequences fall out. The ceiling on segments is
load-bearing, because `3 ** MAX_PATH_SEGMENTS` has to fit in the Postgres
`INTEGER` the column is; and ties need a deterministic second key — `/a/:x` and
`/a/:y` score identically, and without one the winner would depend on the order
Postgres happened to return rows in, which can differ between replicas.

**Decode each path segment once, and only after splitting.** Decoding first
turns a `%2F` into a separator and splits one segment into two, which is how a
traversal gets through a router that reads as correct. A malformed escape is
kept as its literal text rather than failing the request — `decodeURIComponent`
throws on a lone `%`, and a 400 nobody asked for is a worse answer than matching
the characters that were actually sent.

**A public response body written by a stranger needs an allowlist, not a
warning.** While execution shares an origin with the rest of the site, an
endpoint that can answer `text/html` can serve a sign-in page under this site's
name. `content-type.ts` is default-deny — JSON, plain text, XML, CSV — and a
value outside it collapses to `text/plain` rather than being refused, because
the response is still worth serving, just not under a type that makes it
executable. Pair it with `nosniff` and `Content-Security-Policy: sandbox` on
every response, and note in the route handler that author-supplied headers are
applied _before_ the security set is re-applied, or one `set` overwrites the
protection.

**`proxy.ts` runs on everything, including routes that must not pay for it.**
The matcher catches every non-static path, so a public API route would get a
Supabase session refresh and a `Set-Cookie` for this site's auth written onto
its response. The prefix check has to live _inside_ the proxy function, because
`config.matcher` values must be build-time constants.

# Publishing a Schema Somebody Else Will Generate Code From

`src/modules/graphql-server/` derives a GraphQL schema from a stored `db.json`
and serves it. Five things in it generalise past this tool, and the first two are
the ones most likely to be got wrong somewhere else.

**A derived name is a published contract, so print it beside what it came from.**
The REST studio also singularises — `posts` → `postId` for `_embed` — and its own
comment says the inflector is deliberately naive, because a wrong guess there
costs one embed that comes back empty. Here the same guess becomes a **type
name**: it goes into the SDL, into every introspection response, into whatever
`graphql-codegen` wrote, and into the source of everyone who consumed the API
before anybody noticed. So `naming.ts` carries the irregulars — and, because no
inflector is ever complete, the studio prints the derived name next to the
document key for every resource. That is what turns a wrong guess from something
a consumer finds in generated code into something the author sees first. The same
applies to every repair: a hyphen becoming a camel hump and a leading digit
gaining an underscore are both **reported**, never done quietly.

**Infer a published type from all the data, not a sample.** `fieldsOf` in the
REST studio samples fifty records, and that is right there — the list is a hint
for writing a query. Here the answer becomes the schema, and a type inferred from
fifty records that record four thousand contradicts is a schema its own data
fails to validate against. Two specification facts fall out and both are easy to
miss: **GraphQL's `Int` is 32-bit**, so a larger whole number must be `Float` or
it throws at response time rather than rounding; and a field that is a string in
one record and a number in another is the `JSON` scalar, not the wider of the
two — there is no type that is both, and pretending otherwise moves the failure
from the schema, where it is visible, to a 500.

**A public GraphQL endpoint needs three bounds, and each catches what the others
miss.** This is the whole security difference from a REST fixture: GraphQL moves
a request's cost from the server's route table to the caller's query, and derived
relations are **cyclic by construction** — a `Post` has `comments` and every
`Comment` has a `post`. Depth stops the cycle. An estimated node count, multiplied
down the tree from each list field's page size, stops breadth. A root-field count
stops `a: posts b: posts c: posts …`, which adds no depth and no estimated cost.
All three run before a single resolver, because the point is to refuse the work
rather than measure it. Three rules make them actually hold:

- **A page-size default is load-bearing, not cosmetic.** The estimator can only
  multiply because every list field has a size it cannot exceed. Remove the
  default and every list has to be assumed at its maximum, which refuses ordinary
  two-level queries.
- **Read the page size from variables too.** A bound a `$perPage` could slip past
  is no bound at all, and every real client sends variables.
- **Bound the analysis separately from what it estimates.** Fragment spreads add
  no depth and no estimated cost but multiply the *walk*: thirty acyclic fragments
  each spreading the next twice is 2³⁰ visits, and the query-length cap leaves
  room for hundreds. Without `MAX_ANALYSIS_NODES` the function whose job is to
  refuse expensive queries is itself the expensive query. `NoFragmentCycles` does
  not catch this — nothing here is cyclic.

**Run validation before your own analysis, not alongside it.** `specifiedRules`
is what rejects a fragment that spreads itself, and the guard's walker follows
spreads — so a walker running as a validation rule would not terminate on a
document anybody can send. Two ordered steps, with a comment at each saying why.

**Exempt introspection, and say so.** `__schema` walks the schema, which is
bounded by a document already capped at a megabyte, so its cost is bounded by
something this server controls. Charging it the per-level multiplier refuses the
standard introspection query outright — GraphiQL's is around nine levels deep —
and an endpoint no IDE, no codegen tool and no `apollo client:download-schema`
can read has lost most of its point.

Three smaller rules the module settled:

- **Split the engine at "does this write".** The REST studio reads that from the
  HTTP method; **every GraphQL request is a `POST`**, so only the parsed operation
  knows. `planRequest` does exactly that much work and hands the AST on, so the
  document is parsed once and a query never pays for a row lock.
- **Honour `GET` as safe.** The GraphQL-over-HTTP specification reserves it for
  reads, and honouring that is what stops a link — in an email, in a crawler's
  queue, in a chat client's preview fetcher — from writing to somebody's fixture.
  It is a property of the *transport*, so it arrives on the request rather than
  being decided by the engine.
- **A studio's own runner must not be a privileged client.** The query editor
  posts to the real endpoint from the browser rather than through a Server Action.
  The Action would skip the transport rules, the rate limit and the `GET`/`POST`
  split, so a query that worked on the page could fail from `curl` — and the
  studio would be the one place the endpoint's own rules did not apply.

**A hand-written printer needs the reference parser to check it.** `renderSdl` is
hand-written on purpose, so the SDL can be shown and downloaded without pulling
`graphql-js` into the client bundle — which leaves the obvious failure: a printer
that agrees with itself and with nothing else. So `sdl.test.ts` parses the printed
text with `graphql-js`'s own parser and compares the result against the schema
built directly from the same model, both canonicalised through
`lexicographicSortSchema` with descriptions stripped. That is the QR encoder's
rule applied to a printer, and it earned its keep immediately: it found that
`{"posts": []}` and `{"profile": {}}` both produced a **type with no fields**,
which is a GraphQL syntax error — so the most natural way to start an empty
server produced an endpoint that refused every request, introspection included.

# Putting Something on a Map

A pin is a claim, and it is a far stronger one than the data behind it usually
supports. The Domain Inspector's propagation card
(`domain-inspector/components/world-map.tsx` plus `domain/countries.ts`) is the
shape to copy, and most of what it cost was deciding what _not_ to draw.

**Match the pin's precision to the data's.** Every country code in that tool
comes from a registry — an RDAP allocation, an operator's published service
location — and a registry knows which country a block was assigned to, never
which building it is plugged into. So the coordinates are country centroids, the
basemap is capped at `MAX_ZOOM` so it never promises street level, and the copy
says which claim is being made. A city-level pin over country-level data is a
lie that renders beautifully.

**Reject a data source whose location you cannot defend.** Three resolvers were
dropped from the propagation table for exactly this: Tiarap and RethinkDNS both
sit behind Cloudflare, so their pins would land on Cloudflare's network and a
duplicate would be dressed as an independent sample; NextDNS answers from an
Austrian block while the company is American, so no single country is not
misleading. Finding this out cost one `curl` per candidate through Team Cymru's
origin zone. Do it before writing the table, not after.

**A measurement with two causes has to name the second one.** The card was
finished, tested and byte-correct when a live run against `github.com` returned
five different addresses across nine resolvers. Nothing was wrong: that is
GeoDNS steering, and from one vantage point it is indistinguishable from a
change still spreading. Amber with no sentence beside it reads as "your change
is broken". The fix is `divergenceNote`, rendered only when there _is_
divergence — and the general rule is that a signal with an innocent explanation
must carry it, or the tool trains people to ignore the signal.

Leaflet itself has seven traps, all in `world-map.tsx`:

- **Import it inside the effect, never at the top.** It is ~150 KB that touches
  `window` on evaluation, so a static import both breaks the server render and
  lands in the island's first chunk for every reader — including the ones whose
  report has no map in it.
- **`circleMarker`, not `marker`.** Leaflet's default pin is a PNG resolved
  against a CSS-relative path, which every bundler breaks and everybody patches
  with `L.Icon.Default.mergeOptions`. A circle is an SVG `<path>` carrying a
  `className`, and Leaflet writes `fill`/`stroke` as presentation attributes —
  which any CSS rule outranks, so a pin takes design tokens directly.
- **Build tooltips as DOM, not as an HTML string.** `bindTooltip` accepts both
  and the string form is `innerHTML`. Pin text is derived from what a stranger's
  DNS returned, so the only safe version is the one where escaping is not a step
  somebody can forget.
- **One effect that rebuilds everything, not three that create, retint and
  repin.** Creation is async, so an effect ordered after it can run before the
  map exists — a bug that only appears on a slow connection. Rebuilding on a
  theme toggle costs a few tiles and nine circles, and the discarded pan
  position is not state anyone relied on. The `cancelled` flag checked
  immediately after the `await` is what stops React's double effect from meeting
  "Map container is already initialized".
- **A basemap built as a backdrop has to be brought onto the palette, and that
  is a solve rather than a taste.** Dark Matter and Positron both sit _under_
  bright data overlays by design, and their tiles are pure neutral grey — dark
  is water `#262626` over land `#090909`, light is water `#d4dadc` under land
  `#fafaf8`. The dark card is `oklch(0.187)`, which falls _between_ those two,
  so land and water are each within a few values of their own frame and the
  whole thing mushes. Turning the brightness up until it separates is the wrong
  fix and looks it: it lands the ocean at `oklch(0.471)`, a lit grey slab on a
  dark card, which reads as a screenshot pasted into the page. The right fix
  moves land _below_ `--background` and water _above_ `--muted`, so the map
  reads against the card from both sides at the card's own lightness.

    That is tractable because the source is neutral: a colour matrix on a grey
    collapses to three constant per-channel gains, so `sepia → hue-rotate →
saturate` is exactly a tint and `brightness → contrast` in front of it is
    exactly a levels remap. Solve them numerically against the tokens — port the
    Filter Effects matrices, grid-search the tint for the target's channel
    ratios, then search brightness/contrast on the _composed_ chain. Solving the
    levels algebraically against a scalar gain is wrong; the tint's gain is
    per-channel, and treating it as scalar clipped the light theme to flat white.
    Then **render it and look at it** — raw, previous and solved side by side on
    the card colour, per the rule in **A Byte-Exact Codec Can Still Be a Bad
    Tool**. That is what showed the light theme's low `saturate` doing a second
    job nobody asked for: Positron draws administrative borders in a salmon pink
    that belongs to nothing else on this site.

    Reach for the `_nolabels` tiles at the same time. CARTO labels each region
    in its local script, so a single card ends up carrying `AFRIKA`, `亚洲` and
    `AMÉRICA DO SUL` at once, in none of which is the reader's chosen locale.

- **Animating a `circleMarker` needs `transform-box: fill-box`.** An SVG path
  scales about the viewport origin by default, so a ring that should expand out
  of its pin instead flies off the map. Pair it with
  `transform-origin: center`. This is safe alongside Leaflet, which positions a
  path by rewriting its `d` attribute and never touches `transform` on the path
  itself. Bind the tooltip to the widest ring rather than the core — a 4px hover
  target is not one — and keep the inner circles `interactive: false` so the
  pointer falls through to it.
- **A pale border around the map is two bugs, not a style choice.** Leaflet puts
  `.leaflet-container` on the element it is _handed_, so `[&_.leaflet-container]`
  — the descendant form — silently matches nothing and leaves Leaflet's own
  `#ddd` as the backdrop. `[&.leaflet-container]` is the fix, and it is worth
  checking any vendor override that targets a class the library adds to a node
  you already own. That backdrop is only visible because of the second bug:
  `zoomSnap` defaults to whole numbers and `fitBounds` snaps _down_, so a frame
  the world nearly fills gets the next size smaller with a band of backdrop
  above and below it. Set `zoomSnap: 0` for an exact fit, and floor `minZoom` at
  the zoom where the world covers the frame — `log2(max(width, height) / 256)`,
  since Web Mercator is a square of `256·2^zoom` pixels — recomputed on
  Leaflet's `resize`. Where covering the frame and showing every pin conflict,
  covering wins: a pin that needs a drag is a smaller loss than a border the
  reader reads as a rendering fault.

Two more that are not Leaflet's fault:

- **Tiles are a third-party request from the reader's browser**, and this site
  claims to run in the browser and store nothing. CARTO is used because it is
  the rare basemap with a matched light/dark pair — raw OpenStreetMap has no
  dark twin and would leave one theme with a white rectangle in it — and the
  fetch is disclosed in the README rather than left implied.
- **A map is hover-only, so it can never be the only copy.** Every pin's
  contents also appear as text in the list beside it. `country-chip.tsx` is the
  same rule at chip scale: the two-letter code stays visible next to the flag,
  because Windows renders a regional-indicator pair as plain letters, several
  flags are unrecognisable to most readers, and a screen reader gets nothing
  from the glyph. The flag is ornament, the code is the label, and the tooltip —
  on a real focusable `<button>` — is the answer for whoever wants it.

`Intl.DisplayNames` supplies ~250 translated country names, which is why they
are not in both catalogues. Its output can differ between ICU builds, so the
hydration rule in **Platform APIs That Read the Host** would normally bar it —
it is allowed in `use-country-name.ts` only because every caller lives under the
report view, which mounts after the server action returns and is therefore never
server-rendered. Move a caller above that boundary and the rule applies again.

# Calling a Metered Worker

Every tool that fronts a Workers AI model reads its endpoint and bearer key in
`repository/`, on the server, and never from the browser. Two consequences fall
out of that, both found building the Watermark Remover.

**A per-IP limit upstream becomes a per-deployment limit here.** The worker sees
this server's address in `CF-Connecting-IP`, not the visitor's, so a
"five uploads a minute per IP" rule is five a minute for the whole site.
Setting `X-Forwarded-For` does not help — Cloudflare's own header wins. Either
have the worker prefer a forwarded-IP header from a trusted caller, or say
plainly in the copy that the limit is shared. Never describe an upstream
per-connection limit as if it were per visitor.

**Send the smallest thing that answers the question.** The Watermark Remover
crops the square around the mask in the browser, sends that at the model's own
512 px, and composites the reply back onto the full-resolution original through
the same strokes. The upload is smaller, the model works at near-native detail,
and every pixel the reader did not mark is still theirs. Reach for the same
shape before uploading a whole file: the browser has a canvas, and `domain/`
may hold that glue as long as the arithmetic around it stays pure and tested
(`watermark-remover/domain/region.ts` is the geometry, `canvas.ts` the glue).

A canvas paint colour is the one place a raw colour literal is correct — it
sits over the reader's photograph, not over a themed surface, so no token
applies. Say so in a comment where you write it.

---

# Documentation Is Part of the Change

Code and the documents describing it ship together. Documentation drift is a
defect in the change that caused it, never a follow-up ticket — a reader landing
on the README should never be told a shipped tool is still planned, or be given
a variable list that does not start the app.

### When a new tool ships

Flipping a catalog entry to `status: "available"` obliges all of:

- **`README.md`** — add the tool to the **Tools** table with its route, category
  and a one-line description, and remove it from the planned list underneath.
- **`example.env`** — every variable the tool reads, with a comment saying what
  it is for and what happens when it is blank.
- **`README.md` environment table** — the same variables, with whether they are
  required and what degrades without them.
- **`README.md` configuration table** — any new config file, or a change to what
  an existing one is responsible for.
- **`CONTRIBUTING.md`** — only when the tool changes how contributors work: a new
  shared component worth reusing, a new directory in the module layout, a new
  verification step.
- **`CLAUDE.md`** — only when the tool establishes a pattern the next one should
  follow, or a trap the next author would otherwise walk into.

### When anything else changes

- A new script in `package.json` → the **Scripts** table.
- A new environment variable → `example.env` and the environment table, together.
- A new directory under `src/modules/<feature>/` → the project-structure block.
- A new top-level config file → the configuration table.
- A dependency that changes how the project is run or built → **Getting started**.

### The rule

Before calling any change done, re-read the sections of `README.md` it touches
and ask whether they are still true. If a table, list, or count has gone stale,
it is part of this change, not the next one.

---

# Design System

Tokens live in `src/app/globals.css`. Use them; do not introduce raw colours.

- Semantic tokens (`--background`, `--card`, `--muted-foreground`, …) are
  defined for both themes. Dark mode is a separate palette, not an inversion.
- Five accents: `--brand-{violet,cyan,amber,rose,emerald}`. A component opts in
  by applying `TOOL_ACCENT_VARS[accent]`, which sets `--tool-accent`; every
  tinted surface then reads that one variable.
- Five syntax colours: `--syntax-{string,number,keyword,key,call}`, for code and
  nothing else. They exist because the brand hues are **not** usable as
  foreground text at 13px: on a near-white card in light mode `--brand-amber`
  measures 2.8:1 and `--brand-cyan` 3.4:1, both under the 4.5:1 small text
  needs. The syntax set is darker at the same hue angles and clears 4.5:1 on
  every surface code sits on, in both themes. Reaching for `text-brand-*` inside
  a code block is the mistake this family exists to prevent — and the general
  rule it comes from is that a token tuned for a chip is not thereby tuned for
  body text.
- Custom utilities: `bg-grid`, `panel-sheen`, `text-gradient`. From the shadcn
  preset: `scroll-fade-*`, `shimmer`, `no-scrollbar`.
- Radii scale from `--radius: 0.7rem`. Cards use `rounded-2xl`, controls
  `rounded-xl`, small chips `rounded-lg`.

Motion:

- `motion` (Framer). 200–300ms, ease `[0.22, 0.61, 0.36, 1]`; springs for
  shared-layout indicators only.
- Shared-layout indicators need a unique `layoutId`. Components rendered in
  both the desktop rail and the mobile drawer take a `layoutIdPrefix` prop —
  duplicate ids make the indicator jump between the two copies.
- Respect `useReducedMotion()`; return the plain element rather than animating.

### Animating a server component

`motion/react` is client-only. Importing it into a server component turns that
component — and everything it renders — into client code. So the animated
element is always a client component. The only question is how thin you keep
the boundary around it.

The answer is a **client wrapper**: a small `"use client"` component that
renders the `motion` element and takes `children`. The server component imports
the wrapper, not `motion`. Children stay server-rendered and pass straight
through the RSC boundary.

Everything lives in `src/components/motion/`:

- `motion-tokens.ts` — `MOTION_EASE`, `MOTION_DURATION`, `MOTION_STAGGER`,
  `staggerDelay()`. Framework-free, so server and client read the same numbers.
  Never import React or `motion` here.
- `reveal.tsx` — `Reveal` (fades up on scroll into view) and `FadeIn` (fades in
  on mount, for above-the-fold content). Both carry the reduced-motion gate.
- `motion-primitives.tsx` — `MotionDiv`, the escape hatch for a one-off neither
  wrapper covers. It has no reduced-motion gate, so you own accessibility when
  you use it. Need another tag? Add a sibling export.

Rules:

- A server component may import `Reveal`, `FadeIn`, `MotionDiv` and the tokens.
  It may never import `motion/react`.
- Reach for `Reveal` or `FadeIn` before `MotionDiv`, and `MotionDiv` before a
  new bespoke wrapper. A new wrapper needs a reason the existing three cannot
  cover.
- **Never use `motion/react-client`.** It looks like it animates from a server
  component; it does not. It resolves to `framer-motion/client`, whose module
  already carries `"use client"` — same bundle, same boundary. What it costs
  you: every `initial`/`animate`/`transition` object is serialised into the RSC
  payload on every render of every element, and a server component cannot call
  `useReducedMotion()`, so the accessibility gate is unreachable.
- Pass `as` when the wrapper sits somewhere a `<div>` is invalid. A wrapper
  directly inside `<ul>` must be `as="li"` — otherwise the markup is invalid
  and screen readers drop the list semantics. The reduced-motion branch honours
  `as` too.
- Stagger with `staggerDelay(index)`, never inline arithmetic. It caps the delay
  so a long list does not leave the last card waiting a full second.
- Read durations from `MOTION_DURATION` and easing from `MOTION_EASE`. A
  literal `[0.22, 0.61, 0.36, 1]` anywhere outside `motion-tokens.ts` is a bug.

```tsx
// server component — no "use client", no motion import
import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";

<ul className="grid gap-3 sm:grid-cols-2">
    {tools.map((tool, index) => (
        <Reveal key={tool.id} as="li" delay={staggerDelay(index)} className="h-full">
            <ToolCard tool={tool} />
        </Reveal>
    ))}
</ul>;
```

If you want a genuinely smaller bundle, the lever is `m` + `LazyMotion`, not the
import path. Neither wrapper style changes how much JS ships.

Interaction:

- **A result produced by a press has to be brought into view.** A workbench
  card plus its options is most of a laptop viewport, so the answer to the
  button you just pressed lands below the fold and the page looks as though
  nothing happened. `useResultScroll` from
  `tools/components/use-result-scroll.ts` is the one implementation: put its
  `ref` on the result wrapper, call `scrollToResult()` from the handler, and add
  `scroll-mt-6` so the target does not sit flush against the viewport edge.

    Three rules it encodes, and none of them is optional if you hand-roll it
    instead:

    - **Wait a frame.** The element does not exist at the moment the handler sets
      state; a `requestAnimationFrame` runs after React commits, so the target is
      measurable by the time it is scrolled to.
    - **Never scroll something already on screen.** Yanking the page when the
      answer is already visible is worse than not scrolling. The hook skips when
      the target is at least 40% in view.
    - **Honour `prefers-reduced-motion`.** Smooth scrolling is vestibular motion.
      The query is read at call time, not at render, so a reader who changes the
      setting mid-session is respected without a re-render.

    Call it where the result _appears_ — for most tools, inside the success
    branch, after the early return that handles failure. **Only for discrete
    actions**, never for a derived-during-render result, where it would drag the
    page on every keystroke.

    **Never scroll to a destination that can turn out empty.** The Domain
    Inspector and the Port Scanner both scroll when the scan _starts_, because
    `tools/components/scan-radar.tsx` mounts in that same commit and watching
    the sweep beats watching a gap — and that bought a
    bug: an unparseable hostname left the reader parked at a blank slot with the
    reason sitting off-screen beside the input they had to fix. Scrolling early
    is allowed, but only with both halves of the fix:

    - **Reject what you can reject before moving the page.** `checkHostSyntax`
      lives apart from `hostname.ts` precisely so the island can run it without
      pulling `tldts` and its suffix list into the bundle. A typo then costs no
      Turnstile token, no round trip, and no scroll.
    - **Render the remaining failures at the destination.** A lookup that
      started and then failed says so in the result slot, not only in the status
      strip beside the field. Arriving somewhere empty and having to scroll back
      to learn why is what makes the whole gesture feel broken.

    The split is worth copying: a complaint about the _input_ belongs beside the
    input and must not move the page; a complaint about the _lookup_ belongs
    where the answer would have been.

- Hover-only affordances must stay reachable without a pointer. Gate them on
  `[@media(hover:hover)]` and pair with `focus-visible:opacity-100`.
- Never disable a rule to satisfy `react-hooks/set-state-in-effect`. Use a ref
  for deferred imperative work, `useIsHydrated()` for hydration-gated UI, or an
  event handler.
- Base UI `Button` expects a real `<button>`. For navigation use
  `<Link className={cn(buttonVariants(), …)}>`, not `<Button render={<Link/>}>`.

---

# Error Handling

- Never swallow exceptions.
- Return typed errors.
- Show friendly messages.
- Log unexpected failures.

---

# Accessibility

Every feature must support:

- keyboard navigation
- focus states
- screen readers
- accessible labels

---

# Performance

Prefer:

- Server Components
- Suspense
- Streaming
- Lazy loading
- Dynamic imports

Avoid unnecessary client rendering and memoization.

---

# Security

- Validate all input.
- Escape user content.
- Never expose secrets.
- Never commit credentials.
- Use secure cookies.
- Apply CSRF protection where appropriate.
- Follow OWASP best practices.

---

# Code Quality

- Functions should do one thing.
- Prefer early returns.
- Avoid deep nesting.
- Use explicit names.
- Keep modules cohesive.
- Refactor duplication immediately.

---

# Logging

Do not leave:

```ts
console.log();
console.error();
```

inside production code.

Use `logEvent` from `src/modules/observability/domain/logger.ts`. It emits one
JSON line per event so browser and server output can be filtered without
parsing free-form strings.

```ts
logEvent("error", "uuid.download_failed", { format, error: describeError(err) });
```

---

# Running and Verifying Locally

Ask before spending the machine's resources. The following require the
maintainer's explicit permission each time — never start them unprompted:

- headless browsers of any kind (Chromium/Chrome via CDP, Playwright,
  Puppeteer) and any screenshot or visual-diff run
- long-lived dev servers (`next dev`) and production servers (`next start`)
- full production builds (`next build`, `bun run build`)
- anything else long-running, memory-hungry, or that spawns background
  processes

Ask once, plainly, and wait. Do not infer permission from an earlier "yes" —
approval covers that run only.

Without permission, verify statically. These are cheap and always allowed:

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --check "src/**/*.{ts,tsx,css,json}"
```

**Judge each of them by its exit code, and never filter `tsc`'s output.** This
one shipped a broken build. `tsconfig.json` includes `.next/dev/types/**/*.ts`,
and an interrupted `next dev` can leave a truncated file there — an unterminated
string literal is a _syntax_ error, and TypeScript stops after the grammar pass
when it meets one, so it never reaches semantic checking at all. Piping the
output through `grep -v "^\.next/"` therefore prints nothing and looks exactly
like success, while three real type errors in `src/` sit unreported until Vercel
runs the same command without the filter.

If `tsc` reports anything under `.next/`, that is a blocking condition, not
noise: `rm -rf .next/dev/types` and run it again. The directory is regenerated
by the next `next dev`.

That combination catches type errors, lint violations, formatting drift, and
domain-logic regressions. It does not catch layout, contrast, or overflow
problems — so when work is UI-visible, say plainly that it is unverified
visually and hand over a short list of what to check, rather than implying it
was reviewed.

If permission is granted, clean up afterwards: stop every server and browser
that was started, and delete any screenshots or scratch profiles.

---

# Version Control

Never commit or push on your own. The working tree belongs to the maintainer.

Do not run, unless asked for that action in that message:

- `git commit` (including `-a`, `--amend`, or as part of a chained command)
- `git push`, `git tag`, or anything that writes to a remote
- `git checkout -b`, `git switch -c`, `git merge`, `git rebase`, `git stash`
- `gh pr create`, `gh pr merge`, `gh release create`
- any hook, alias, script, or `&&` chain whose net effect is one of the above

"Finish the feature", "make it work", or "clean it up" is not permission to
commit. Neither is a green test run. Asking once does not authorise the next
one — permission is per-request.

Reading is always fine: `git status`, `git diff`, `git log`, `git show`.

Leave changes staged at most, and only when asked. When work is done, say what
changed and let the maintainer decide what to record.

---

# Local Environment

Node 20+ is required. `prisma generate` — and therefore `bun run build`, which
chains it — crashes on Node 18 with `ERR_REQUIRE_ESM`. If the shell resolves an
older Node, put a modern one on `PATH` first:

```bash
export PATH="$HOME/.nvm/versions/node/v22.17.0/bin:$HOME/.bun/bin:$PATH"
```

`bun` lives at `~/.bun/bin` and is not always on a non-interactive `PATH`.

---

# Pull Request Checklist

Every change must pass:

- TypeScript
- ESLint
- Prettier
- Unit Tests
- Domain Layer
- Repository Layer

Checked by the maintainer, not by an automated browser run (see
**Running and Verifying Locally**):

- Build
- Light Mode
- Dark Mode
- English
- Bangla
- Accessibility

---

# AI Coding Rules

1. Think before writing code.
2. Reuse existing code before creating new abstractions.
3. Never bypass the Domain Layer.
4. Never access Prisma or Supabase outside repositories.
5. Never modify `components/ui`.
6. Prefer Server Components.
7. Prefer Server Actions over Route Handlers.
8. Update unit tests whenever business logic changes.
9. Localize every user-facing string, in `en.json` and `bn.json` together.
10. Verify both Light and Dark modes.
11. Keep `domain/` free of React, `next-intl`, and I/O.
12. Generate per-request values on the server and pass them down as props.
    Never parse a zone-less date string with `new Date`, and never build an
    option list from a runtime enumeration — both read the host and break
    hydration. See **Platform APIs That Read the Host**.
13. Restructure code to satisfy a lint rule; never disable the rule.
14. Animate a server component through a wrapper from `components/motion/`.
    Never import `motion/react` into a server component, and never use
    `motion/react-client`.
15. Never launch a headless browser, dev server, or production build without
    asking first. Permission is per-run, not standing.
16. Say plainly when UI work has not been checked in a browser, and list what
    needs looking at.
17. Never commit, push, branch, or open a PR unless that exact action was
    asked for in that message.
18. Ship documentation with the code. A new tool updates the README's tool
    table; a new variable updates `example.env` and the environment table
    together. Stale docs are a defect in the change that caused them.
19. Give every free-text field a ceiling and a visible countdown. Cap a short
    identity field with `maxLength`; never cap a content box — show the meter,
    render the failure under it, and disable what submits it.
20. Bound the size of anything a Zod schema passes through as `z.unknown()`.
    `serverActions.bodySizeLimit` is 11 MB for the whole app.
21. Keep implementations simple.
22. Leave the codebase cleaner than you found it.
