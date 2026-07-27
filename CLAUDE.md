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

Existing feature modules: `tools` (catalog, search, clipboard, file saving),
`uuid`, `overview`, `preferences`, `seo`, `observability`.

Rules that keep this honest:

- `domain/` must stay framework-free. If a file needs `getTranslations`, it is
  a presenter, not domain.
- `domain/` stores icons and accents as string keys. The UI resolves them
  (`tool-icon.tsx`, `tool-accent.ts`). Never put a React component in a domain
  module.
- No `console.*` in feature code. Use `logEvent` from
  `src/modules/observability/domain/logger.ts`.
- Do not add to `lib/`. It holds `cn` and the Prisma/Supabase clients only.

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
- Add `loading.tsx` with skeletons that match the real layout block for block.

**6. Keep the client island small.** One interactive component per tool holding
state; everything static stays a server component. Long-form content is a
server component, never part of the island.

**7. Write the article after the tool**, using semantic sections with stable
`id`s and a TOC entry. Cap prose at `max-w-[68ch]`; let tables break out inside
`overflow-x-auto`.

**8. Verify before calling it done.** These four are cheap — always run them:

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

# Design System

Tokens live in `src/app/globals.css`. Use them; do not introduce raw colours.

- Semantic tokens (`--background`, `--card`, `--muted-foreground`, …) are
  defined for both themes. Dark mode is a separate palette, not an inversion.
- Five accents: `--brand-{violet,cyan,amber,rose,emerald}`. A component opts in
  by applying `TOOL_ACCENT_VARS[accent]`, which sets `--tool-accent`; every
  tinted surface then reads that one variable.
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
18. Keep implementations simple.
19. Leave the codebase cleaner than you found it.
