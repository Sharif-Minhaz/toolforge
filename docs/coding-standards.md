# Coding Standards

What goes inside a file. Layering lives in [`architecture.md`](architecture.md);
the request path lives in [`server-and-data.md`](server-and-data.md).

---

## Tech stack

- Next.js 16+ · React 19 · TypeScript (strict)
- Tailwind CSS v4 · Base UI · shadcn/ui
- Prisma ORM · PostgreSQL · Supabase (Auth/Storage/Realtime only)
- next-intl
- Bun · Prettier · ESLint

`AGENTS.md` applies: this is not the Next.js in your training data. Read the
relevant guide in `node_modules/next/dist/docs/` before writing route code, and
heed deprecation notices.

---

## TypeScript

- Strict mode. Never `any`.
- Never disable a TypeScript or ESLint rule. Restructure the code instead.
- Typed errors over thrown strings — see [Error handling](#error-handling).
- Literal unions over open `string` wherever a value indexes a message
  catalogue, a map, or a switch.

---

## Formatting

Prettier is the source of truth. Always:

- Format modified files.
- Organize imports.
- Remove unused imports and variables.
- Keep naming consistent.

Verify with `bunx prettier --check "src/**/*.{ts,tsx,css,json}"`.

---

## Package manager

Always Bun. Never npm, pnpm or yarn.

```bash
bun install
bun add
bun remove
bun run
bun test
bunx
```

---

## UI components

Before creating any UI component:

1. Check whether shadcn/ui already provides it.
2. If available, generate it:

```bash
bunx --bun shadcn@latest add <component>
```

Never manually recreate an existing shadcn component.

### `components/ui` is vendor code

Never modify it. Customize only through composition, wrappers, props, variants,
`className`, and slots.

### Base UI notes

`Button` expects a real `<button>`. For navigation use
`<Link className={cn(buttonVariants(), …)}>`, not `<Button render={<Link/>}>`.

Base UI's dismiss hook listens for `Escape` on `document`. A component with its
own dismissable layer must swallow the key — see
[`patterns/input-suggestions.md`](patterns/input-suggestions.md) for the working
example and the caveat about capture-phase listeners.

---

## Component rules

- Prefer Server Components.
- Use Client Components only for browser APIs, state, animations or event
  handlers.
- Keep client components as small as possible. One interactive island per tool
  holding state; everything static stays a server component. Long-form content
  is always a server component.

Anything that reads the host — a zone-less date, a runtime enumeration, an
engine's error text — has a hydration rule attached. See
[`hydration-and-platform-pitfalls.md`](hydration-and-platform-pitfalls.md).

---

## Styling

Use Tailwind CSS, CVA and tailwind-merge. Avoid custom CSS unless absolutely
necessary. Tokens and motion live in [`design-system.md`](design-system.md).

Every feature must fully support Light Mode and Dark Mode.

Grid children need `min-w-0`, or wide content blows the page out horizontally at
390px.

---

## Loading states

Every asynchronous page or component must expose a loading state.

- Create `loading.tsx` for async App Router pages.
- Never show blank pages.
- Prefer skeletons over spinners, and make them resemble the final layout —
  block for block, including the three related-tool cards at the foot of a tool
  page.
- Skeletons support light and dark mode like everything else.

For client mutations:

- disable actions while pending
- use optimistic UI when appropriate
- show inline loading indicators

Always expose Loading, Success, Error and Empty. Prefer Suspense boundaries for
independently loading sections.

---

## Error handling

- Never swallow exceptions.
- Return typed errors.
- Show friendly messages.
- Log unexpected failures.

Every refusal keeps its own name. `missing`, `pending` and `expired` reach the UI
as separate states, because "this expired" and "you mistyped it" are different
things for the reader to do next — see
[`case-studies/short-links.md`](case-studies/short-links.md).

Where a verdict concerns the input, it belongs beside the input. Where it
concerns the operation, it belongs where the answer would have been — see the
scroll rules in [`design-system.md`](design-system.md).

---

## Logging

Do not leave `console.log()` or `console.error()` in production code.

Use `logEvent` from `src/modules/observability/domain/logger.ts`. It emits one
JSON line per event so browser and server output can be filtered without parsing
free-form strings.

```ts
logEvent("error", "uuid.download_failed", { format, error: describeError(err) });
```

---

## Accessibility

Every feature must support:

- keyboard navigation
- focus states
- screen readers
- accessible labels

Specific rules that have already caught bugs:

- Hover-only affordances must stay reachable without a pointer. Gate them on
  `[@media(hover:hover)]` and pair with `focus-visible:opacity-100`.
- A wrapper directly inside `<ul>` must render as `<li>` — otherwise the markup
  is invalid and screen readers drop the list semantics.
- A live region that speaks on every keystroke is unusable. Attach
  `role="status"` only once there is something to say — see
  [`patterns/input-limits.md`](patterns/input-limits.md).
- Anything conveyed only by hover, colour or a glyph needs a text equivalent
  beside it — see [`patterns/maps.md`](patterns/maps.md).

---

## Performance

Prefer Server Components, Suspense, streaming, lazy loading and dynamic imports.
Avoid unnecessary client rendering and memoization.

Import anything large inside the function or effect that uses it, never at module
top level — see [`case-studies/image-codecs.md`](case-studies/image-codecs.md)
for the codec rule and [`patterns/maps.md`](patterns/maps.md) for Leaflet.

---

## Code quality

- Functions should do one thing.
- Prefer early returns.
- Avoid deep nesting.
- Use explicit names.
- Keep modules cohesive.
- Refactor duplication immediately.
