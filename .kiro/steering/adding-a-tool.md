---
inclusion: manual
---

# Adding a New Tool

Pull this doc into chat with `#adding-a-tool` when building, extending, or refactoring a
ToolForge tool.

Work in this order. Each step has a rule that is easy to violate.

**1. Register it.** Add the id to `TOOL_IDS` in `src/modules/tools/types/index.ts`, then the
entry in `src/modules/tools/domain/tool-catalog.ts` with `status: "planned"` until it ships.
`href` must be `/tools/<id>` — a test enforces this. Pick an `accent` from the five brand
hues and an `icon` from `ToolIconName`; add a new icon key to both the union and the map in
`tool-icon.tsx` if none fits.

**2. Add copy to both locales.** `tools.<id>.name` and `tools.<id>.description` in
`en.json` _and_ `bn.json`. Missing Bangla keys fail the type check.

**3. Build the domain layer first, with tests.** Pure functions, typed errors (see
`UuidQuantityError`), explicit constants for limits. Get `bun test` green before writing any
UI.

**4. Add Zod schemas** in `validation/` for options, search params, and any server-action
payload. Search params use `.catch(undefined)` per field so a malformed link degrades to
defaults instead of a 500.

**5. Build the page.** Server component by default:

- `generateMetadata` from `<tool>.meta` messages, plus `alternates.canonical`, `openGraph`,
  and `twitter`.
- Emit `JsonLd` — `SoftwareApplication`, `BreadcrumbList`, and `FAQPage` when the article
  has an FAQ.
- Generate initial results **on the server** and pass them to the client island as props.
  Never generate in `useState` initialisers — server and client produce different values and
  hydration breaks.
- Add `loading.tsx` with skeletons that match the real layout block for block.

**6. Keep the client island small.** One interactive component per tool holding state;
everything static stays a server component. Long-form content is a server component, never
part of the island.

**7. Write the article after the tool**, using semantic sections with stable `id`s and a TOC
entry. Cap prose at `max-w-[68ch]`; let tables break out inside `overflow-x-auto`.

**8. Verify before calling it done.** These four are cheap — always run them:

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --check "src/**/*.{ts,tsx,css,json}"
```

Visual review is the author's job, not an automated one. Hand off this checklist instead of
launching a browser:

- light and dark
- English and Bangla
- 390px and 1440px
- sidebar expanded and collapsed
- at 390px, `document.documentElement.scrollWidth === window.innerWidth` (grid children need
  `min-w-0` or wide content blows out the page)

**9. Flip status.** Change the catalog entry to `status: "available"` once the page ships,
and check the overview wiring picks it up.

## Reference implementations

`src/modules/uuid/` and `src/modules/base64/` set the patterns for domain, tests, island,
route, and article. Read one before inventing a new shape.
