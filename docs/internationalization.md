# Internationalization

`next-intl`. Two locales: English (`en`, default) and Bangla (`bn`).

Never hardcode UI text.

```tsx
t("settings.title");
```

---

## No `[locale]` route segment

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

---

## Message catalogue

`src/messages/{en,bn}.json`. Both files must stay key-for-key identical.
`src/global.d.ts` types `AppConfig["Messages"]` from `en.json`, so keys are
checked at compile time — a missing Bangla key fails the type check.

**Only build message keys from literal unions** (`ToolId`, `ToolCategory`,
`UuidVersion`). Never from a plain `string` — it defeats the typing.

A corollary that has bitten once: an id that becomes a message key **may not
contain a dot**, because a dot is `next-intl`'s namespace separator. See
[`patterns/tree-editors.md`](patterns/tree-editors.md).

---

## Client bundles get a subset

`src/app/layout.tsx` passes a hand-picked slice of the catalogue to
`NextIntlClientProvider`. Long-form article copy stays on the server. When a new
client component needs a namespace, add it to that slice explicitly.

Server components localise data before it crosses the boundary — see
`src/modules/tools/presenters/localize-tools.ts`. Client components receive
`LocalizedTool[]`, not raw catalog entries plus a translator.

---

## Numbers

Counts that read as prose go through `useFormatter().number()` /
`getFormatter()`, or an ICU `{value, number}` argument, so Bangla renders Bengali
numerals. Raw JSX numbers do not.

Keep Western digits only where the number mirrors machine input: form field
values, quantity presets, and result-list row indices.

### Numbers too big for a separator

A number too big for a grouping separator needs a name, not a notation. `Intl`'s
two options both fail past a point: compact runs out of CLDR names after "T", so
4.1 × 10²⁰ renders as `410,000,000T` in English and as a string of lakh-crores in
Bangla, and scientific renders it as `4.1E20`, which is exact and tells a
non-specialist nothing.

`tools/domain/magnitude.ts` classifies the magnitude — plain under a million, a
short-scale name up to a decillion, `10ⁿ` above that — and
`tools/components/use-readable-number.ts` turns that into "410 quintillion" from
the `common.magnitude` messages. The names are translated because CLDR's are not
reachable this high; the digits still go through `Intl`.

It returns a `string`, not a node, because the result is nearly always an ICU
argument — `"{value} years"` is one message and a `ReactNode` cannot be passed
into it. That is also why the exponent uses Unicode superscript glyphs: they
survive inside a translated string, and Unicode has no Bengali superscripts, so
they stay Latin in both locales exactly as the Bangla copy already writes 10¹¹.

---

## Country names

`Intl.DisplayNames` supplies ~250 translated country names, which is why they are
not in both catalogues. Its output can differ between ICU builds, so the
hydration rule in
[`hydration-and-platform-pitfalls.md`](hydration-and-platform-pitfalls.md) would
normally bar it — it is allowed in `use-country-name.ts` only because every
caller lives under the report view, which mounts after the server action returns
and is therefore never server-rendered. **Move a caller above that boundary and
the rule applies again.**

---

## Bangla typography

Inter carries no Bengali glyphs. `--font-sans` falls through to
`Noto Sans Bengali` per glyph. Bengali ascenders are taller than Latin, so never
put `leading-none` on a localized string — badges need `leading-[1.3]` or looser.
