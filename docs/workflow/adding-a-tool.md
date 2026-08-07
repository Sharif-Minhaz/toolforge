# Adding a New Tool

Work in this order. Each step has a rule that is easy to violate.

---

## 1. Register it

Add the id to `TOOL_IDS` in `src/modules/tools/types/index.ts`, then the entry in
`src/modules/tools/domain/tool-catalog.ts` with `status: "planned"` until it
ships.

- `href` must be `/tools/<id>` — a test enforces this.
- Pick an `accent` from the five brand hues and an `icon` from `ToolIconName`;
  add a new icon key to both the union and the map in `tool-icon.tsx` if none
  fits.
- A new **category** needs `TOOL_CATEGORIES` widened *and*
  `categories.<id>.name`/`.description` in both locales, or the sidebar renders a
  heading with no words in it.

## 2. Add copy to both locales

`tools.<id>.name` and `tools.<id>.description` in `en.json` _and_ `bn.json`.
Missing Bangla keys fail the type check. See
[`../internationalization.md`](../internationalization.md).

## 3. Build the domain layer first, with tests

Pure functions, typed errors (see `UuidQuantityError`), explicit constants for
limits. Get `bun test` green **before writing any UI**. See
[`../testing.md`](../testing.md).

If the tool emits a format or reproduces a behaviour something else has to read,
plan the cross-verification now, not after — see
[Verifying against something that is not you](../testing.md#verifying-against-something-that-is-not-you).

## 4. Add Zod schemas

In `validation/`, for options, search params, and any server action payload.

- Search params use `.catch(undefined)` per field, so a malformed link degrades
  to defaults instead of a 500.
- Bound the size of anything passed through as `z.unknown()` — see
  [`../patterns/input-limits.md`](../patterns/input-limits.md).

## 5. Build the page

Server component by default:

- `generateMetadata` from `<tool>.meta` messages, plus `alternates.canonical`,
  `openGraph`, and `twitter`.
- Emit `JsonLd` — `SoftwareApplication`, `BreadcrumbList`, and `FAQPage` when the
  article has an FAQ.
- Generate initial results **on the server** and pass them to the client island
  as props. Never generate in `useState` initialisers — server and client produce
  different values and hydration breaks. See
  [`../hydration-and-platform-pitfalls.md`](../hydration-and-platform-pitfalls.md).
- Close the page with `<RelatedTools toolId="<id>" />` from
  `src/modules/tools/components/related-tools.tsx`, below the article. It picks
  its own suggestions — same category first, then popularity — and renders
  nothing rather than a stub heading when there is nothing to suggest.
- Add `loading.tsx` with skeletons that match the real layout block for block,
  including the three related-tool cards at the foot.

## 6. Keep the client island small

One interactive component per tool holding state; everything static stays a
server component. Long-form content is a server component, never part of the
island.

Give every free-text field a ceiling and a visible countdown — see
[`../patterns/input-limits.md`](../patterns/input-limits.md).

Bring the result into view when a press produces it — see
[`../design-system.md`](../design-system.md#bringing-a-result-into-view).

## 7. Write the article after the tool

Use semantic sections with stable `id`s and a TOC entry. Cap prose at
`max-w-[68ch]`; let tables break out inside `overflow-x-auto`.

If the tool cannot keep the site's "nothing is uploaded" promise, the disclosure
goes **above the controls**, not in the article — see
[`../engineering-principles.md`](../engineering-principles.md#say-what-you-cannot-keep).

## 8. Update the repository documentation in the same change

A tool is not shipped until the docs stop describing the repository as it was
before it. See [`documentation.md`](documentation.md) for exactly what to touch.

## 9. Verify before calling it done

These four are cheap — always run them:

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --check "src/**/*.{ts,tsx,css,json}"
```

Judge each by its exit code and never filter `tsc`'s output — see
[`verification.md`](verification.md) for the trap that shipped a broken build.

Visual review is the author's job, not an automated one. Hand off this checklist
instead of launching a browser:

- light and dark
- English and Bangla
- 390px and 1440px
- sidebar expanded and collapsed
- at 390px, `document.documentElement.scrollWidth === window.innerWidth`
  (grid children need `min-w-0` or wide content blows out the page)
