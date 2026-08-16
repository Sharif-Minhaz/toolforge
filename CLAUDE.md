@AGENTS.md

# ToolForge — Operating Manual

ToolForge is a free developer and utility toolbox: Next.js 16, React 19,
TypeScript strict, Tailwind v4, Base UI + shadcn/ui, Prisma + PostgreSQL,
Supabase (Auth/Storage/Realtime only), next-intl, Bun.

**This file is the rules. [`docs/`](docs/) is the reasoning.**

Read this before starting anything. Then read the one or two documents that cover
what you are about to touch — the index is below, and the rules point at them.
Do not try to hold the whole handbook in your head; it is written to be opened at
the right page.

---

## Documentation index

```
CLAUDE.md                 ← you are here. Rules, workflow, decision trees.
AGENTS.md                 This is NOT the Next.js you know. Read the guide in
                          node_modules/next/dist/docs/ before route code.
README.md                 What the project is, how to run it, what tools exist.
CONTRIBUTING.md           The human contributor working agreement.

docs/README.md            Full documentation map + "where new knowledge goes".
docs/
├── architecture.md                      layers, module layout, the shared
│                                        tools/ seam, when to lift an abstraction
├── engineering-principles.md            the cross-cutting doctrines and their why
├── coding-standards.md                  TS, formatting, components, styling,
│                                        loading, errors, logging, a11y, perf
├── server-and-data.md                   server components → actions → route
│                                        handlers; domain/repository; validation
├── internationalization.md              next-intl, catalogue, numbers, Bangla
├── design-system.md                     tokens, motion, interaction
├── testing.md                           unit tests + cross-verification doctrine
├── hydration-and-platform-pitfalls.md   platform APIs that read the host
├── security.md                          how gates fail, abuse surfaces, quotas
├── workflow/adding-a-tool.md            the nine-step order
├── workflow/verification.md             what to run; permissions; the tsc trap
├── workflow/documentation.md            docs ship with the code
├── patterns/                            reusable shapes — copy these
└── case-studies/                        what one subsystem cost, per module
```

**Read the matching document before you edit these:**

| Touching… | Read first |
| --- | --- |
| A new tool, start to finish | [`docs/workflow/adding-a-tool.md`](docs/workflow/adding-a-tool.md) |
| Anything with `useState` in a client island | [`docs/hydration-and-platform-pitfalls.md`](docs/hydration-and-platform-pitfalls.md) |
| Prisma, Supabase, a Server Action | [`docs/server-and-data.md`](docs/server-and-data.md) |
| User-facing text or numbers | [`docs/internationalization.md`](docs/internationalization.md) |
| The opening section of a tool article | [`docs/patterns/article-openings.md`](docs/patterns/article-openings.md) |
| Colours, motion, scroll behaviour | [`docs/design-system.md`](docs/design-system.md) |
| A format somebody else has to read | [`docs/testing.md`](docs/testing.md) |
| An outbound request from the server | [`docs/patterns/outbound-requests.md`](docs/patterns/outbound-requests.md), [`docs/security.md`](docs/security.md) |
| A free-text field | [`docs/patterns/input-limits.md`](docs/patterns/input-limits.md) |
| `aes` | [`docs/case-studies/aes.md`](docs/case-studies/aes.md) |
| `background-remover` | [`docs/case-studies/background-remover.md`](docs/case-studies/background-remover.md) |
| `blur-placeholder` | [`docs/case-studies/blurhash.md`](docs/case-studies/blurhash.md) |
| `bson` | [`docs/case-studies/bson.md`](docs/case-studies/bson.md) |
| `curl` | [`docs/case-studies/curl.md`](docs/case-studies/curl.md) |
| `diff` | [`docs/case-studies/diff.md`](docs/case-studies/diff.md) |
| `domain-inspector` | [`docs/case-studies/domain-inspector.md`](docs/case-studies/domain-inspector.md) |
| `graphql-server` | [`docs/case-studies/graphql-server.md`](docs/case-studies/graphql-server.md) |
| `image-compressor`, `image-converter` | [`docs/case-studies/image-codecs.md`](docs/case-studies/image-codecs.md) |
| `image-resizer`, any image tool's intake | [`docs/case-studies/image-resizer.md`](docs/case-studies/image-resizer.md) |
| `json-server` | [`docs/case-studies/json-server.md`](docs/case-studies/json-server.md) |
| `mcp`, or any tool's MCP adapter | [`docs/case-studies/mcp.md`](docs/case-studies/mcp.md) |
| `mock-server` | [`docs/case-studies/mock-server.md`](docs/case-studies/mock-server.md) |
| `port-scanner` | [`docs/case-studies/port-scanner.md`](docs/case-studies/port-scanner.md) |
| `qr` | [`docs/case-studies/qr.md`](docs/case-studies/qr.md) |
| `rsa` | [`docs/case-studies/rsa.md`](docs/case-studies/rsa.md) |
| `rsa-encrypt` | [`docs/case-studies/rsa-encrypt.md`](docs/case-studies/rsa-encrypt.md) |
| `short-links`, `shortener` | [`docs/case-studies/short-links.md`](docs/case-studies/short-links.md) |
| `url-parser` | [`docs/patterns/derived-state-editors.md`](docs/patterns/derived-state-editors.md) |
| `watermark-remover`, `ai-*` | [`docs/case-studies/watermark-remover.md`](docs/case-studies/watermark-remover.md) |

---

## How to work in this repository

### Before writing code

1. **Read the surrounding files.** Match the module's existing shape before
   introducing a new one.
2. **Search for a prior implementation.** Almost everything here has been done
   once already — check `src/modules/tools/` first, then the module closest to
   the problem. The shared-layer inventory is in
   [`docs/architecture.md`](docs/architecture.md#the-shared-layer-srcmodulestools).
3. **Reuse before abstracting.** The ladder is below.
4. **Do not invent new architecture.** If the existing layers cannot express the
   thing, say so and ask — do not route around them quietly.
5. **Open the case study** if the module has one. Every one of them records a
   defect that is cheap to reintroduce.

### While writing code

- Domain layer first, with tests, before any UI.
- Server component by default; the client island stays small.
- Every user-facing string in `en.json` **and** `bn.json`, together.
- Every free-text field gets a ceiling and a visible countdown.
- An MCP adapter for anything that runs on the server, beside the tests.
- Typed errors, named refusals, no swallowed exceptions.
- No `console.*`; `logEvent` instead.

### Before saying it is done

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --check "src/**/*.{ts,tsx,css,json}"
```

Then check, by reading the diff:

- [ ] **Hydration** — nothing derived from the host during render.
- [ ] **Server/client boundary** — no `motion/react` or Prisma outside where it
      belongs; the island holds only what needs state.
- [ ] **Localization** — both catalogues, key-for-key.
- [ ] **Accessibility** — keyboard, focus, labels, and a text equivalent for
      anything conveyed by hover or colour.
- [ ] **Light and dark** both reasoned about.
- [ ] **MCP** — a new or changed server-runnable tool has its adapter in
      `src/modules/mcp/tools/`, and the registry test is green.
- [ ] **Documentation** updated in this change, not the next one.
- [ ] **UI verified visually?** If not, say so plainly and hand over the list in
      [`docs/workflow/verification.md`](docs/workflow/verification.md).

---

## Rule tiers

Rules below are graded. Treat them differently:

- **Critical** — breaking one violates the project's architecture or its promises
  to readers. Do not break these; if you think one must be broken, stop and ask.
- **Strong convention** — the established answer. Deviating needs a reason you
  can state in a comment.
- **Guideline** — advice. Use judgement.

---

## Critical rules

1. **Never bypass the domain layer.** UI calls `getUsers()`, never
   `prisma.user.findMany()`. → [`docs/server-and-data.md`](docs/server-and-data.md)
2. **Only `repository/` may import Prisma or Supabase.** Supabase is Auth,
   Storage and Realtime only; the database is always Prisma.
3. **`domain/` stays framework-free** — no React, no `next-intl`, no I/O, no
   React components as values. A file that needs `getTranslations` is a
   presenter. → [`docs/architecture.md`](docs/architecture.md)
4. **Never modify `components/ui`.** It is vendor code. Compose, wrap, pass
   props, use variants and slots.
5. **Never use `any`. Never disable a TypeScript or ESLint rule.** Restructure
   the code to satisfy it — including
   `react-hooks/set-state-in-effect`.
6. **Generate per-request values on the server and pass them as props.** Never in
   a `useState` initialiser. Never `new Date()` on a zone-less string, never an
   option list from a runtime enumeration, never an engine's error message in
   rendered output. → [`docs/hydration-and-platform-pitfalls.md`](docs/hydration-and-platform-pitfalls.md)
7. **Localize every user-facing string, in `en.json` and `bn.json` together.**
   Build message keys only from literal unions. →
   [`docs/internationalization.md`](docs/internationalization.md)
8. **Validate every input with Zod** — forms, params, search params, actions.
   Search params use `.catch(undefined)` per field. Bound the size of anything
   passed through as `z.unknown()`; `serverActions.bodySizeLimit` is 11 MB
   app-wide.
9. **Never cap a content box with `maxLength`.** Show the meter, render the
   failure under the box, and disable what submits it. Short identity fields are
   capped. → [`docs/patterns/input-limits.md`](docs/patterns/input-limits.md)
10. **A limiter fails closed.** No database, no salt, a thrown transaction — the
    operation is refused, not allowed. → [`docs/security.md`](docs/security.md)
11. **Resolve first, then connect to the address you checked**, and guard every
    redirect hop, whenever the server reaches a host somebody typed. →
    [`docs/patterns/outbound-requests.md`](docs/patterns/outbound-requests.md)
12. **A public response body a stranger authored gets a content-type allowlist**,
    plus `nosniff` and `Content-Security-Policy: sandbox`.
13. **Never launch a headless browser, dev server, or production build without
    asking.** Permission is per-run, never standing. →
    [`docs/workflow/verification.md`](docs/workflow/verification.md)
14. **Never commit, push, branch, tag, stash, rebase, merge, or open a PR** unless
    that exact action was asked for in that message. A green test run is not
    permission. Reading git is always fine.
15. **Never import `motion/react` into a server component, and never use
    `motion/react-client`.** Animate through a wrapper in `components/motion/`. →
    [`docs/design-system.md`](docs/design-system.md#animating-a-server-component)
16. **Always Bun.** Never npm, pnpm or yarn.
17. **No `console.*` in feature code.** `logEvent` from
    `src/modules/observability/domain/logger.ts`.
18. **Ship documentation with the code.** A new tool updates the README tool
    table; a new variable updates `example.env` and the environment table
    together. Stale docs are a defect in the change that caused them. →
    [`docs/workflow/documentation.md`](docs/workflow/documentation.md)
19. **Say plainly when UI work has not been checked in a browser**, and list what
    needs looking at.
20. **Expose every server-runnable tool over MCP, in the same change that ships
    it.** If the domain layer runs without a canvas, a worker or a browser
    cookie, it gets an adapter in `src/modules/mcp/tools/` and an entry in
    `MCP_TOOLS`. A tool that genuinely cannot — it needs pixels, it mints a
    cookie-owned resource, it spends somebody's API budget — says so in
    `tools/index.ts` and on `/mcp`, rather than being left out quietly. →
    [`docs/case-studies/mcp.md`](docs/case-studies/mcp.md)

## Strong conventions

21. **Prefer Server Components.** Client components only for browser APIs, state,
    animation or event handlers, and kept small.
22. **Prefer Server Actions over Route Handlers.** A Route Handler is for a caller
    that is not our UI: webhooks, uploads, streaming, third-party callbacks, or
    somebody else's browser following a link.
23. **Check shadcn/ui before building any UI component**
    (`bunx --bun shadcn@latest add <component>`).
24. **Use design tokens; never raw colours.** Code uses `--syntax-*`, never
    `--brand-*`. The one exception is a canvas paint colour over a photograph —
    comment it.
25. **Every async page has a `loading.tsx` with skeletons that match the layout.**
    Never a blank page. Always expose Loading, Success, Error and Empty.
26. **Test the domain layer, not the markup**, and get `bun test` green before
    writing UI. Inject anything touching the DOM, the clipboard, the clock or
    randomness.
27. **Verify against something that is not you** whenever a tool emits a format or
    reproduces a behaviour something else must read. →
    [`docs/testing.md`](docs/testing.md#verifying-against-something-that-is-not-you)
28. **Every refusal keeps its own name.** `missing`, `pending` and `expired` are
    three states, not one error.
29. **A complaint about the input belongs beside the input; a complaint about the
    operation belongs where the answer would have been.**
30. **Bring a result produced by a press into view** with `useResultScroll` — and
    never scroll to a destination that can turn out empty.
31. **Add to `tools/` the moment a second tool needs it**, whole, in the same
    change. Do not add to `lib/`.
32. **Do not disclose a limitation only in the article.** If a tool cannot keep
    the site's "nothing is uploaded" promise, the disclosure sits above the
    controls.
33. **Prettier is the source of truth.** Format, organize imports, remove unused
    ones.

## Guidelines

34. Think before writing code; prefer simplicity and single responsibility.
35. Functions do one thing. Early returns. Avoid deep nesting. Explicit names.
36. Refactor duplication immediately — unless removing it costs more than it
    saves (rule 40's fourth branch).
37. Prefer Suspense, streaming, lazy loading and dynamic imports; avoid
    unnecessary client rendering and memoization.
38. Cap prose at `max-w-[68ch]`; let tables break out inside `overflow-x-auto`.
39. Leave the codebase cleaner than you found it.

---

## Decision trees

### 40. Should this be shared?

```
1. Search src/modules/tools/ and neighbouring modules.
   → Found it?                        Use it.
2. Exactly one feature needs it?      Keep it local. Do not generalise yet.
3. A second feature needs it?         Lift it to tools/ — whole, same change.
4. Lifting needs 3+ injected params?  Leave the duplication. It costs less.
```
→ [`docs/architecture.md`](docs/architecture.md#when-to-lift-something-into-the-shared-layer)

### 41. Server component, client island, or action?

```
Does it need browser APIs, state, animation or an event handler?
├─ No  → Server Component. (default)
└─ Yes → Client Component, as small as possible.
         Does it need data or a mutation?
         ├─ Our own UI calling it   → Server Action.
         └─ Somebody else's client  → Route Handler, and only then.
```
→ [`docs/server-and-data.md`](docs/server-and-data.md)

### 42. Cap the field, or warn?

```
Short identity field (name, alias, hostname, key, colour, header)?
└─ Cap with maxLength. One over is a mistake; refusing the keystroke costs
   nothing.

Content box (db.json, curl command, JWT, Markdown, OpenAPI)?
└─ NEVER cap. A silent truncation makes an invalid document — or a valid one
   that means something else.
   Show the meter → render the failure under the box → disable the submit.
```
→ [`docs/patterns/input-limits.md`](docs/patterns/input-limits.md)

### 43. Debounce this input?

```
Expensive derivation?                          → 300 ms. (the default)
Input controlled by the derived value?         → never. It would revert keystrokes.
Filter over data already in memory?            → never. A lagging list reads broken.
Sits behind a caret (highlighting)?            → never. Use a length ceiling.
```
Where a debounce is deliberately absent, say so in a comment.
→ [`docs/engineering-principles.md`](docs/engineering-principles.md#match-the-mechanism-to-the-cost)

### 44. Which way should this gate fail?

```
If the gate is bypassed, what does the service become?
├─ A reader loses a convenience   → fail open. Degrade toward working.
└─ Something we would not have
   shipped (unmetered scanning,
   unbounded writes, an open relay) → fail closed. Refuse.
```
→ [`docs/security.md`](docs/security.md#decide-which-way-a-gate-fails)

### 45. Implement it, or depend on it?

```
Who reads the output?
├─ Only this site        → implement it. A wrong row is one wrong row.
└─ Somebody else         → depend on the reference implementation.
                           Check transitive deps and who maintains it first.
                           Then read what its defaults do to your data.
```
→ [`docs/engineering-principles.md`](docs/engineering-principles.md#depend-or-implement)

### 46. The reference implementation has a bug. Match it?

```
Does it change bytes or responses other people read?
├─ Yes                                → match it, and comment why.
├─ It is a defect in a control the
│  reader turns                       → implement it correctly; exclude that
│                                       value from the cross-check.
└─ Only reachable with malformed
   input no working client sends      → diverging is allowed. Prefer a refusal
                                        to a guess, and document it.
```
→ [`docs/engineering-principles.md`](docs/engineering-principles.md#cloning-behaviour-match-diverge-or-refuse)

### 47. Where does this new knowledge go?

```
A rule the next author must not break?  → one line here + reasoning in docs/.
A shape a second tool would copy?       → docs/patterns/.
A defect specific to one subsystem?     → docs/case-studies/<module>.md.
Neither?                                → a comment at the line.
```
Never state the same reasoning twice. The second place gets a link.
→ [`docs/workflow/documentation.md`](docs/workflow/documentation.md)

---

## Running things locally

**Always allowed** — the four checks above. Judge each by its **exit code**, and
**never filter `tsc`'s output**: a truncated file under `.next/dev/types` is a
syntax error that stops TypeScript before semantic checking, so filtering it out
looks exactly like success while real errors go unreported. If `tsc` reports
anything under `.next/`, that is blocking: `rm -rf .next/dev/types` and run again.

**Ask every time, and wait** — headless browsers, screenshots, `next dev`,
`next start`, `next build`, and anything else long-running or memory-hungry.
Approval covers that run only. Clean up afterwards.

Node 20+ is required (`prisma generate` crashes on 18 with `ERR_REQUIRE_ESM`):

```bash
export PATH="$HOME/.nvm/versions/node/v22.17.0/bin:$HOME/.bun/bin:$PATH"
```

Full detail, including the PR checklist and the version-control rules:
[`docs/workflow/verification.md`](docs/workflow/verification.md).
