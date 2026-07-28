<div align="center">

<img src="public/brand-mark.webp" width="88" height="88" alt="ToolForge" />

# ToolForge

**Developer utilities, forged for speed.**

A privacy-first toolbox of developer utilities. Every tool runs entirely in your browser —
nothing is uploaded, logged, or tracked.

[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000.svg?logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/Bun-runtime-fbf0df.svg?logo=bun&logoColor=black)](https://bun.sh)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-06b6d4.svg)](CONTRIBUTING.md)

</div>

---

## Why it exists

Most online developer tools ask you to paste a JWT, an API response, or a customer record into
someone else's server. ToolForge does the work in the browser instead. There is no upload step,
no request log, and no analytics on what you convert.

Everything else follows from that:

- **Local first.** Conversion and generation live in a pure `domain/` layer with no I/O.
- **Server-rendered.** The first result is generated on the server and hydrated, so no tool ever
  shows an empty box on load.
- **Bilingual.** English and Bangla, including Bengali numerals where a number reads as prose.
- **Light and dark.** Two hand-tuned palettes, not one inverted.
- **Keyboard reachable.** Every affordance has a focus state; no control is hover-only.

## Tools

| Tool                      | Route                     | Category   | What it does                                                                                |
| ------------------------- | ------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| UUID Generator            | `/tools/uuid`             | Generators | v1, v4 and v7 identifiers in bulk, with every export format                                 |
| Base64 Encoder / Decoder  | `/tools/base64`           | Encoding   | Text and files, standard or URL-safe, data URIs, per-line mode, 19 character sets           |
| URL Encoder / Decoder     | `/tools/url`              | Encoding   | Percent-encoding across component, path and query profiles, with double-encoding detection  |
| JWT Encoder / Decoder     | `/tools/jwt`              | Security   | Inspect claims, verify a signature, or sign a fresh token (HMAC, RSA, ECDSA)                |
| Hash Generator / Verifier | `/tools/hash`             | Security   | SHA family, MD5, bcrypt and Argon2, plus constant-time comparison                           |
| JSON Formatter            | `/tools/json`             | Formatting | Beautify, minify, validate and sort keys — large payloads run in a worker                   |
| Markdown Preview          | `/tools/markdown`         | Formatting | GFM live preview with Mermaid diagrams and KaTeX maths                                      |
| Color Converter           | `/tools/color`            | Formatting | HEX, RGB, HSL, HSV, CMYK and OKLCH, WCAG contrast, 50–950 scales, Tailwind and CSS palettes |
| Regex Tester              | `/tools/regex`            | Text       | Match, explain and substitute, with catastrophic-backtracking protection                    |
| Random Text Generator     | `/tools/lorem`            | Text       | Twelve public-domain sources by word, character, sentence or paragraph                      |
| AI Text Detector          | `/tools/ai-text-detector` | AI         | Estimates whether a passage was written by a language model                                 |

Planned and already visible in the catalogue: Timestamp Converter, Password Generator, Cron Parser,
QR Generator, Diff Checker, Slug Generator, AI Image Detector, Gemini Watermark Remover.

Picking one up is the easiest way to contribute — see
[Adding a tool](CONTRIBUTING.md#adding-a-tool).

Every tool except the AI Text Detector runs entirely in the browser. That one calls a Cloudflare
Workers AI endpoint behind a Turnstile challenge, which is why it is the only tool with required
environment variables of its own.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Base UI via
shadcn/ui · next-intl · Zod · Prisma + PostgreSQL · Supabase (auth and storage only) · Bun

## Getting started

### Prerequisites

- **Bun** — the only supported package manager. [Install it](https://bun.sh/docs/installation).
- **Node.js 20 or newer.** `prisma generate` runs on Node and crashes on Node 18 with
  `ERR_REQUIRE_ESM`.

### Setup

```bash
git clone https://github.com/Sharif-Minhaz/toolforge.git
cd toolforge
bun install
cp example.env .env.local
```

Fill in `.env.local`, then generate the Prisma client and start the dev server:

```bash
bun run db:generate
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable                               | Required         | Purpose                                                                                |
| -------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | **Yes**          | Read by the proxy on every navigation                                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Yes**          | Same                                                                                   |
| `NEXT_PUBLIC_SITE_URL`                 | No               | Canonical URLs, Open Graph, JSON-LD. Defaults to localhost.                            |
| `DATABASE_URL`                         | No               | Pooled connection for app runtime                                                      |
| `DIRECT_URL`                           | Migrations only  | Non-pooled connection for `db:migrate`, `db:push`, Studio                              |
| `NEXT_PUBLIC_MEASUREMENT_ID`           | No               | GA4 measurement id. Blank means gtag.js is never loaded.                               |
| `NEXT_PUBLIC_TEXT_DETECTOR_API`        | AI Text Detector | Cloudflare Workers AI endpoint. `TEXT_DETECTOR_API` overrides it server-side.          |
| `TEXT_DETECTOR_API_KEY`                | AI Text Detector | Bearer token for that endpoint. Server-only — never exposed to the client.             |
| `NEXT_PUBLIC_TURNSTILE_KEY`            | AI Text Detector | Turnstile site key. Absent, and the tool renders disabled rather than unprotected.     |
| `TURNSTILE_SECRET`                     | AI Text Detector | Turnstile secret, read only by `src/modules/ai-text-detector/repository/turnstile.ts`. |

> **Analytics is gated three ways.** `gtag.js` only enters the document when a well-formed `G-…` id
> is configured, the visitor has clicked **Allow** on the consent banner, and the build is
> production. Development and preview traffic therefore never reaches the live property, while the
> banner still renders locally so it stays reviewable. `src/modules/analytics/domain/analytics-state.ts`
> is the single place those rules live.

> **Heads up:** the two Supabase variables are currently required to run the app at all.
> `src/proxy.ts` refreshes the auth session on every navigation and `@supabase/ssr` throws when the
> URL and key are missing — even though no shipped tool needs an account yet. A free Supabase
> project is enough; nothing is written to it.

> **The AI Text Detector degrades rather than breaks.** Leave its four variables blank and the rest
> of the app runs normally; that one tool renders with its controls disabled and says why. Every
> other tool is pure browser arithmetic and needs no configuration at all.

No tool needs the database. Prisma is wired up for features that are not built yet, and
`bun run db:generate` works without a live connection.

### Configuration files

| File                   | What lives there                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `next.config.ts`       | The `next-intl` plugin pointed at `src/i18n/request.ts`, and the React Compiler (`reactCompiler: true`)   |
| `prisma.config.ts`     | Prisma 7 config. It loads `.env.local` then `.env` itself, and supplies `DIRECT_URL` to CLI commands only |
| `prisma/schema.prisma` | Schema only — connection URLs moved to `prisma.config.ts` in Prisma 7                                     |
| `components.json`      | shadcn settings: `base-nova` style, Tabler icons, `src/app/globals.css` as the token source               |
| `example.env`          | The template to copy to `.env.local`. Every variable in the table above appears there with a comment      |

## Scripts

| Command                | What it does                                      |
| ---------------------- | ------------------------------------------------- |
| `bun run dev`          | Dev server on port 3000                           |
| `bun run build`        | `prisma generate` then a production build         |
| `bun run start`        | Serve the production build                        |
| `bun test`             | Unit tests (domain layer)                         |
| `bun run typecheck`    | `tsc --noEmit`                                    |
| `bun run lint`         | ESLint                                            |
| `bun run format`       | Prettier, writing in place                        |
| `bun run format:check` | Prettier, check only                              |
| `bun run db:generate`  | Regenerate the Prisma client into `src/generated` |
| `bun run db:migrate`   | Create and apply a migration (needs `DIRECT_URL`) |
| `bun run db:deploy`    | Apply pending migrations without creating one     |
| `bun run db:push`      | Push the schema without a migration file          |
| `bun run db:studio`    | Prisma Studio                                     |

## Project structure

Feature-first. Each tool is a self-contained module.

```
src/
  app/                    routes only: page, layout, loading, not-found
    tools/<tool>/         page.tsx, loading.tsx
  components/
    brand/                logo mark and wordmark
    layout/               app shell, sidebar, drawer, theme, locale
    motion/               Reveal / FadeIn wrappers
    ui/                   shadcn vendor code — never edited by hand
  hooks/                  cross-feature client hooks
  i18n/                   locale config, cookie read, request config
  messages/               en.json, bn.json — must stay key-for-key identical
  modules/
    <feature>/
      actions/            "use server" entry points
      components/         feature UI
      domain/             pure logic — no React, no next-intl, no I/O
      presenters/         server-only: domain data + translations → view data
      repository/         the only place Prisma or Supabase may be imported
      tests/              bun tests
      types/              shared types and literal unions
      validation/         Zod schemas
      workers/            web workers, where a conversion is too heavy for the main thread
```

Two boundaries hold the whole thing together:

- **`domain/` is framework-free.** No React, no `next-intl`, no I/O. That is what makes it
  testable without a DOM.
- **Only `repository/` may touch Prisma or Supabase.** Components call `getThing()`, never
  `prisma.thing.findMany()`.

The locale comes from the `toolforge.locale` cookie rather than a URL segment, so tool routes stay
canonical (`/tools/uuid`, never `/en/tools/uuid`).

## Verifying a change

These four are cheap, and every pull request must pass all of them:

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --check "src/**/*.{ts,tsx,css,json}"
```

They do not catch layout, contrast, or overflow problems. Anything UI-visible also needs a look in
the browser — the checklist lives in
[CONTRIBUTING.md](CONTRIBUTING.md#before-you-open-a-pull-request).

## Contributing

Contributions are welcome, and picking up a planned tool is the best place to start.

- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow, branch and commit rules, the PR checklist
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — how we treat each other
- [CLAUDE.md](CLAUDE.md) — the full engineering guidelines, in depth
- [AGENTS.md](AGENTS.md) — read this before writing Next.js code; v16 is not what you remember

Work happens on a branch, never on `main`, and commits use
[Conventional Commits](CONTRIBUTING.md#commit-messages) (`feat:`, `fix:`, `refactor:`, `chore:`, …).

**Using an AI coding agent?** It must read [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) first,
and follow the [`add-tool` skill](.agents/skills/add-tool/SKILL.md) for anything that touches a
tool — new, changed, or refactored. Details in
[Using an AI coding agent](CONTRIBUTING.md#using-an-ai-coding-agent). You remain the author of
whatever it produces.

## License

[MIT](LICENSE) © Sharif Minhaz
