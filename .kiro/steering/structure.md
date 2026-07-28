---
inclusion: always
---

# Folder Structure and Layering

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

Existing modules: `tools`, `uuid`, `base64`, `jwt`, `hash`, `json`, `url`, `markdown`,
`regex`, `analytics`, `observability`, `overview`, `preferences`, `seo`.

Imports use the `@/` alias, which maps to `src/`.

## Layering rules

```
Server Components → Server Actions → Route Handlers
```

Route Handlers only when genuinely required: webhooks, uploads, streaming, external APIs,
third-party callbacks. Do not invent REST endpoints.

- `domain/` stays framework-free. No React, no `next-intl`, no I/O. If a file needs
  `getTranslations`, it is a **presenter**, not domain.
- `domain/` stores icons and accents as string keys. The UI resolves them (`tool-icon.tsx`,
  `tool-accent.ts`). Never put a React component in a domain module.
- Business rules live in the domain layer. Components hold no business logic.
- UI never touches Prisma or Supabase. It calls `await getUsers()`, not
  `prisma.user.findMany()`. See the `data-layer` steering doc.
- No `console.*` in feature code. Use `logEvent` from
  `src/modules/observability/domain/logger.ts`.
- Do not add to `lib/`. It holds `cn` and the Prisma/Supabase clients only.

## Components

- Prefer Server Components. Client Components only for browser APIs, state, animation, or
  event handlers — and keep them as small as possible.
- One interactive client island per tool holds the state. Everything static stays a server
  component. Long-form article content is never part of the island.
- Generate per-request values **on the server** and pass them down as props. Never in a
  `useState` initialiser — server and client produce different values and hydration breaks.

## Loading, error, empty

Every async page or component exposes a loading state. `loading.tsx` for async App Router
pages, skeletons over spinners, matching the real layout block for block, in both themes.
For client mutations: disable actions while pending, optimistic UI where it fits, inline
indicators. Always cover Loading / Success / Error / Empty. Prefer Suspense boundaries for
independently loading sections.

## Errors

Never swallow exceptions. Return typed errors (see `UuidQuantityError`). Show friendly
messages. Log unexpected failures with `logEvent`.

## Validation

Zod for forms, route params, search params, APIs, and Server Actions. Never trust client
input. Search params use `.catch(undefined)` per field so a malformed link degrades to
defaults instead of a 500.

## Code quality

Functions do one thing. Early returns over deep nesting. Explicit names. Cohesive modules.
Refactor duplication immediately. Keep implementations simple. Leave the codebase cleaner
than you found it.
