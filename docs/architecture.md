# Architecture

How the repository is laid out, what each layer may import, and when a piece of
code earns the right to be shared.

Related: [`server-and-data.md`](server-and-data.md) for the request path,
[`coding-standards.md`](coding-standards.md) for what goes inside a file.

---

## Folder structure

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

### Layer rules

- **`domain/` must stay framework-free.** If a file needs `getTranslations`, it
  is a presenter, not domain.
- **`domain/` stores icons and accents as string keys.** The UI resolves them
  (`tool-icon.tsx`, `tool-accent.ts`). Never put a React component in a domain
  module.
- **Only `repository/` may import Prisma or Supabase.** See
  [`server-and-data.md`](server-and-data.md).
- **No `console.*` in feature code.** Use `logEvent` from
  `src/modules/observability/domain/logger.ts` — see
  [`coding-standards.md`](coding-standards.md#logging).
- **Do not add to `lib/`.** It holds `cn` and the Prisma/Supabase clients only.
- **Every free-text field carries a ceiling and shows it.** Pick `cap` or `warn`
  by what a silent cut would destroy — see
  [`patterns/input-limits.md`](patterns/input-limits.md).

### Categories are a literal union

`TOOL_CATEGORIES` is a literal union, and the sidebar groups its list under one
heading per category. A new category needs the union widened **and**
`categories.<id>.name` / `.description` in both locales, or the rail renders a
heading with no words in it.

---

## The shared layer: `src/modules/tools/`

`tools` is the catalog module and also the home of everything more than one tool
needs. Its current contents:

| Concern | Files |
| --- | --- |
| Catalog, search, clipboard, file saving | `domain/tool-catalog.ts`, `domain/clipboard.ts`, `components/related-tools.tsx`, `components/tool-icon.tsx`, `domain/tool-accent.ts` |
| Time zones and calendars | `domain/zone.ts`, `domain/time-zones.ts`, `domain/time-zone-list.ts`, `domain/calendar.ts`, `domain/local-datetime.ts`, `components/zone-picker.tsx`, `components/date-time-picker.tsx` |
| Randomness | `domain/random.ts` (injectable source) |
| Images | `domain/image-codec.ts`, `domain/pixels.ts`, `domain/archive.ts`, `domain/base64.ts`, `domain/hex.ts`, `domain/filenames.ts` |
| Code display | `domain/highlight.ts`, `components/code-editor.tsx`, `components/code-block.tsx` |
| JSON reading and writing | `domain/json-parser.ts`, `domain/json-serialize.ts` over `types/json-tree.ts` |
| Network | `domain/ip.ts`, `domain/host-syntax.ts`, `repository/address-guard.ts`, `components/scan-radar.tsx` |
| Account-free identity and metering | `domain/browser-secret.ts`, `domain/recovery-key.ts`, `domain/secret-cookie.ts`, `domain/server-key.ts`, `domain/rate-window.ts`, `repository/rate-counter.ts` |
| The hosted document | `domain/json-document.ts`, `domain/record-id.ts`, `domain/document-limits.ts`, `domain/document-usage.ts`, `domain/document-format.ts`, `domain/server-name.ts`, `types/json-document.ts`, `components/json-document-editor.tsx`, `components/document-usage-bar.tsx`, `components/server-base-url.tsx` |
| Input ceilings | `domain/input-limit.ts`, `components/input-limit-meter.tsx`, `domain/payload-size.ts` |
| Numbers too big to punctuate | `domain/magnitude.ts`, `components/use-readable-number.ts` |
| Bringing a result into view | `components/use-result-scroll.ts` |
| Cipher payloads and RSA keys | `domain/payload-codec.ts` (UTF-8 / hex / base64, both directions), `domain/pem.ts` (RFC 7468 blocks), `domain/rsa-der.ts` (PKCS#1 ↔ SPKI / PKCS#8, both ways) |

### Modules that carry design notes

The authoritative list of modules is the `src/modules/` directory. These are the
ones whose design is documented, and what each one is:

| Module | What it is | Document |
| --- | --- | --- |
| `tools` | The shared layer above, plus the catalog | this file |
| `short-links` | Every re-pointable link on the site | [`case-studies/short-links.md`](case-studies/short-links.md) |
| `image-compressor` | A batch queue and a smallest-of-four search | [`case-studies/image-codecs.md`](case-studies/image-codecs.md) |
| `image-converter` | A named target per batch, plus the ICO container and the favicon pack | [`case-studies/image-codecs.md`](case-studies/image-codecs.md) |
| `blur-placeholder` | The BlurHash codec and the `blurDataURL` it writes | [`case-studies/blurhash.md`](case-studies/blurhash.md) |
| `curl` | The shell tokenizer, the request model and the four writers around it | [`case-studies/curl.md`](case-studies/curl.md) |
| `domain-inspector` | The address guard, the DoH transport and the signature table | [`case-studies/domain-inspector.md`](case-studies/domain-inspector.md) |
| `bson` | Three readers and three writers over one plain value | [`case-studies/bson.md`](case-studies/bson.md) |
| `port-scanner` | A TCP connect scan behind a quota that fails closed | [`case-studies/port-scanner.md`](case-studies/port-scanner.md) |
| `mock-server` | A node canvas over a stored graph | [`case-studies/mock-server.md`](case-studies/mock-server.md), [`mock-server-studio.md`](mock-server-studio.md) |
| `json-server` | A hosted `json-server`: one pure engine cross-checked against the real package, behind a two-tier size ceiling | [`case-studies/json-server.md`](case-studies/json-server.md) |
| `graphql-server` | The same document served as GraphQL: a schema derived from the data on every request, executed by `graphql-js` behind a three-part query guard | [`case-studies/graphql-server.md`](case-studies/graphql-server.md) |
| `url-parser` | Two editors over one value | [`patterns/derived-state-editors.md`](patterns/derived-state-editors.md) |
| `diff` | A unified patch nothing else has to reject | [`case-studies/diff.md`](case-studies/diff.md) |
| `qr` | A hand-written QR encoder | [`case-studies/qr.md`](case-studies/qr.md) |
| `watermark-remover` | A crop, a metered worker, and a composite back | [`case-studies/watermark-remover.md`](case-studies/watermark-remover.md) |
| `uuid`, `overview`, `preferences`, `seo`, `observability` | Platform modules with no special design notes | — |

---

## When to lift something into the shared layer

```
Before adding an abstraction:

1. Search src/modules/tools/ and the other modules for it.
   → Found it?               Use it.
2. Does exactly one feature need it?
   → Yes.                    Keep it local. Do not generalise yet.
3. Does a second feature now need it?
   → Yes.                    Lift it to tools/ — whole, in the same change.
4. Would lifting it need three or more injected parameters to work?
   → Yes.                    Leave the duplication. The abstraction costs more.
```

Rule 3 is the one that matters, and it is worded as "the moment a second tool
needs it" for a reason: the seam is almost never obvious in advance, and waiting
for a third caller means the second one has already grown its own copy with its
own opinions.

Rule 4 is the brake. There is a worked example of both, below.

### Worked example one: the three image tools

Everything the image tools share — decoding, the four tuned encoder profiles,
Lanczos3 resizing, alpha flattening, the ZIP writer, filename cleaning, and the
bytes-to-base64 loop a `data:` URI needs — lives in `tools/domain/`. What stays
in each module is the part that differs: the compressor searches for the
smallest result, the converter writes the target you named, the placeholder
generator throws away everything but the low frequencies.

`tools/domain/base64.ts` shows where the seam goes. The Base64 tool still owns
everything about _reading_ what a person pasted — the alphabets it names, the
whitespace it tolerates, the positions it reports. What moved is the encoder
alone, because a data URI needs the same sextets and none of the options.

### Worked example two: the three studios, which moved twice

The Mock Server, JSON Server and GraphQL Server studios are the second worked
example, and the seam is instructive because almost none of it was obvious in
advance, and because it moved **twice**.

**The JSON Server Studio's arrival** lifted everything about _owning something
without an account_ — the browser secret, the printable recovery key, the cookie
that holds a capped list of them, the public server key with its reserved-name
list, and the fixed-window throughput counter every public path meters on.

**The GraphQL Server Studio's arrival** lifted the layer underneath that: the
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

### What deliberately did not move

Two things stayed duplicated, and the line between them is the useful part.

Each studio's launcher and workbench are near-identical React and are still two
files each: unifying them would mean injecting two Server Actions, two result
types, a message namespace, a card and a route — six parameters to save a
layout, which is where an abstraction costs more than the duplication it
removes.

And each keeps its own cookie name and its own `usageFull` sentence, because a
visitor at capacity in one studio must not be refused in the other, and "writes
are refused" without naming _which_ operations stopped is a sentence with no
action in it.
