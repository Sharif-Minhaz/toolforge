# Partial prerendering

`next.config.ts` turns on `cacheComponents`. Every page under `src/app/[locale]`
prerenders a static shell, once per language, at build time. Only what reads
the request streams in at request time, behind its own `<Suspense>`. A tool
page's heading, article and related tools arrive as static HTML. The workbench,
which depends on the URL, follows in the same response.

## How a request reaches a prerendered page

The locale still comes from the `toolforge.locale` cookie, and URLs still have
no language in them (`/tools/uuid`). `src/proxy.ts` reads the cookie and
rewrites the request internally to `/<locale>/tools/uuid`. The browser keeps
the canonical URL. `localizePath` in `src/i18n/routing.ts` decides which paths
are pages. Route handlers (`/api`, `/m`, `/j`, `/g`, `/q`, `/s`), files and
`/_next` are never rewritten. `routing.test.ts` fails when a new top-level
folder under `src/app` is not listed in `UNLOCALIZED_ROUTES`.

A typed `/en/tools/uuid` becomes `/en/en/tools/uuid` and 404s. That is
deliberate: one canonical URL per page.

`src/app/layout.tsx` only passes `children` through. The real root layout
(`<html lang>`, fonts, providers) is `src/app/[locale]/layout.tsx`.

## Rules

1. **Call `enterLocale(params)` first in every layout, page and
   `generateMetadata` under `app/[locale]`.** They render independently. One
   that skips the call makes next-intl read the request headers, which fails
   the build.
2. **Nothing per-request in the shell.** `searchParams`, `cookies()`,
   `headers()`, the clock, `Math.random` and `crypto` belong in a
   `<Tool>WorkbenchSection` rendered inside
   `<Suspense fallback={<<Tool>WorkbenchSkeleton />}>`. The danger is real: a
   password, secret or key generated in the shell is baked into the HTML and
   served to every visitor. Copy `src/app/[locale]/tools/uuid/page.tsx`.
3. **The fallback is the same skeleton `loading.tsx` uses.** It lives in
   `modules/<tool>/components/<tool>-workbench-skeleton.tsx`, so the two cannot
   drift.
4. **Only the consent banner and analytics script read cookies in the
   chrome.** `AnalyticsGate` renders inside `<Suspense>`. The sidebar's rail
   state no longer comes from the server. `SIDEBAR_BOOT_SCRIPT` sets
   `<html data-sidebar>` before first paint, `globals.css` sizes the rail from
   it, and `ShellFrame` reads it through `useSyncExternalStore`. The content
   column never shifts. Only the rail's contents switch at hydration.
5. **The clock comes after request data.** Inside a section, `await
   searchParams` (or `cookies()`, `headers()`) before `new Date()`. Next
   refuses the clock in a prerender until something request-time has been
   read.
6. **`usePathname` counts as request data on a route with unknown params.**
   The shell reads it, so `[locale]/layout.tsx` wraps `<AppShell>` in
   `<Suspense>`. Static routes still prerender the whole shell. Routes like
   `mock/[workspaceId]` render it at request time.

## What Server Actions see

An action runs outside `enterLocale`, so `src/i18n/request.ts` falls back to the
cookie. The language in its error messages matches the page.

## Pages keep their state between navigations

With Cache Components, Next.js hides a page you navigate away from with React's
`<Activity>` instead of unmounting it. Coming back restores `useState`, form
input and open popovers as they were. A tool that relied on unmounting to reset
itself must reset explicitly. See
`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`.

## CDN caching

A fully static page is served with a shared `Cache-Control`. The proxy picks the
language from a cookie, so a CDN in front of the app must either run after the
rewrite (as Vercel's does) or vary on the cookie. Otherwise one reader's
language is cached for everybody. Tool pages carry a request-time section, so
they are not shared-cached anyway.
