# ToolForge Engineering Handbook

This directory is the long-form half of the project's engineering documentation.
[`CLAUDE.md`](../CLAUDE.md) at the repository root is the short half: the
operating manual you read **before** starting work. Everything here is what you
read **while** working on a particular thing.

## The contract between the two

`CLAUDE.md` states rules. This directory explains them.

A rule appears in `CLAUDE.md` in its shortest correct form — one or two lines,
enough to follow it and enough to notice when you are about to break it. The
reasoning, the failure it was written after, the code that implements it, and
the edge cases live here, under one heading, in one file.

That split is deliberate and it is the thing to preserve when you add to either
side:

- **A rule with no reasoning goes in `CLAUDE.md`.** Reasoning follows it here.
- **Reasoning is never copied.** If a document needs a rule stated somewhere
  else, it links to it. One concept, one home.
- **A case study is never summarised into a doctrine file.** Doctrine files
  carry a sentence and a link; the story stays whole where it happened.

## Documentation map

```
CLAUDE.md                       operating manual — read first, always
AGENTS.md                       Next.js version warning — read before writing route code
README.md                       what the project is, how to run it, what tools exist
CONTRIBUTING.md                 the contributor working agreement

docs/
├── README.md                   this file — index and map
│
├── architecture.md             layers, module layout, the shared `tools/` seam,
│                               when to lift an abstraction
├── engineering-principles.md   the cross-cutting doctrines: honesty in copy,
│                               earning a warning, matching mechanism to cost,
│                               when to depend and when to implement
├── coding-standards.md         TypeScript, formatting, components, styling,
│                               loading states, errors, logging, accessibility,
│                               performance
├── server-and-data.md          server components → actions → route handlers,
│                               domain/repository layering, Prisma, Supabase,
│                               validation
├── internationalization.md     next-intl, the catalogue, numbers and magnitude,
│                               Bangla typography
├── design-system.md            tokens, accents, syntax colours, motion,
│                               interaction rules
├── testing.md                  unit-test conventions and the cross-verification
│                               doctrine — "verify against something that is not you"
├── hydration-and-platform-pitfalls.md
│                               platform APIs that read the host and break
│                               hydration
├── security.md                 how gates fail, abuse surfaces, secrets, the
│                               guard stack
│
├── workflow/
│   ├── adding-a-tool.md        the nine-step order for shipping a new tool
│   ├── verification.md         what to run, what needs permission, the `tsc`
│   │                           filtering trap, the PR checklist, local env
│   └── documentation.md        documentation is part of the change
│
├── patterns/                   reusable shapes — "copy this whenever X"
│   ├── input-limits.md         every free-text box's ceiling and countdown
│   ├── browser-persistence.md  remembering something in the reader's browser
│   ├── derived-state-editors.md  two editors over one value (URL Parser)
│   ├── format-conversion.md    N readers and N writers, never N² translators
│   ├── syntax-highlighting.md  painting behind a textarea; tokenizer invariants
│   ├── tree-editors.md         editing a recursive union without typing syntax
│   ├── input-suggestions.md    suggesting what somebody could type
│   ├── growth-ceilings.md      a ceiling somebody can come back from
│   ├── outbound-requests.md    reaching a host the reader named, and a worker
│   │                           we own
│   └── maps.md                 putting something on a map
│
├── case-studies/               what one subsystem cost, and what it taught
│   ├── blurhash.md
│   ├── bson.md
│   ├── curl.md
│   ├── diff.md
│   ├── domain-inspector.md
│   ├── graphql-server.md
│   ├── image-codecs.md
│   ├── json-server.md
│   ├── mock-server.md
│   ├── port-scanner.md
│   ├── qr.md
│   ├── short-links.md
│   └── watermark-remover.md
│
└── mock-server-studio.md       the full system design for the Mock Server Studio
```

## Where to look, by what you are doing

| You are… | Read |
| --- | --- |
| Starting any task | [`CLAUDE.md`](../CLAUDE.md) |
| Adding a new tool | [`workflow/adding-a-tool.md`](workflow/adding-a-tool.md) |
| Deciding where code belongs | [`architecture.md`](architecture.md) |
| Writing anything that touches Prisma or Supabase | [`server-and-data.md`](server-and-data.md) |
| Writing a client component | [`hydration-and-platform-pitfalls.md`](hydration-and-platform-pitfalls.md), [`coding-standards.md`](coding-standards.md) |
| Adding user-facing text | [`internationalization.md`](internationalization.md) |
| Styling or animating | [`design-system.md`](design-system.md) |
| Writing tests | [`testing.md`](testing.md) |
| Emitting a format somebody else will read | [`testing.md`](testing.md), [`patterns/format-conversion.md`](patterns/format-conversion.md) |
| Making the server call something | [`patterns/outbound-requests.md`](patterns/outbound-requests.md), [`security.md`](security.md) |
| Adding a free-text field | [`patterns/input-limits.md`](patterns/input-limits.md) |
| Finishing up | [`workflow/verification.md`](workflow/verification.md), [`workflow/documentation.md`](workflow/documentation.md) |

## Where to look, by subsystem

If you are about to change one of these, read its document first. Each one
records a defect that was expensive to find and is easy to reintroduce.

| Module | Document |
| --- | --- |
| `aes` | [`case-studies/aes.md`](case-studies/aes.md) |
| `blur-placeholder` | [`case-studies/blurhash.md`](case-studies/blurhash.md) |
| `bson` | [`case-studies/bson.md`](case-studies/bson.md) |
| `curl` | [`case-studies/curl.md`](case-studies/curl.md) |
| `diff` | [`case-studies/diff.md`](case-studies/diff.md) |
| `domain-inspector` | [`case-studies/domain-inspector.md`](case-studies/domain-inspector.md), [`patterns/maps.md`](patterns/maps.md) |
| `graphql-server` | [`case-studies/graphql-server.md`](case-studies/graphql-server.md) |
| `image-compressor`, `image-converter` | [`case-studies/image-codecs.md`](case-studies/image-codecs.md) |
| `json-server` | [`case-studies/json-server.md`](case-studies/json-server.md), [`patterns/growth-ceilings.md`](patterns/growth-ceilings.md) |
| `mock-server` | [`case-studies/mock-server.md`](case-studies/mock-server.md), [`mock-server-studio.md`](mock-server-studio.md) |
| `port-scanner` | [`case-studies/port-scanner.md`](case-studies/port-scanner.md) |
| `qr` | [`case-studies/qr.md`](case-studies/qr.md) |
| `rsa` | [`case-studies/rsa.md`](case-studies/rsa.md) |
| `short-links`, `shortener` | [`case-studies/short-links.md`](case-studies/short-links.md) |
| `url-parser` | [`patterns/derived-state-editors.md`](patterns/derived-state-editors.md) |
| `watermark-remover`, `ai-*` | [`case-studies/watermark-remover.md`](case-studies/watermark-remover.md) |
| `timestamp` | [`hydration-and-platform-pitfalls.md`](hydration-and-platform-pitfalls.md) |

## Where new knowledge goes

When a change teaches something, it lands in exactly one of these:

1. **A rule the next author must not break** → a line in `CLAUDE.md`, plus its
   reasoning in the matching document here.
2. **A shape the next tool should copy** → `docs/patterns/`.
3. **A defect specific to one subsystem** → `docs/case-studies/`, in that
   subsystem's file.
4. **Nothing generalisable** → a comment at the line, and nothing here.

If you cannot decide between 2 and 3, ask whether a second tool would read it.
If yes, it is a pattern. If it only makes sense with that module's vocabulary in
your head, it is a case study.

Documentation ships with the code that caused it — see
[`workflow/documentation.md`](workflow/documentation.md).
