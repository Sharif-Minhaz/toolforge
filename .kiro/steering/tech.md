---
inclusion: always
---

# Tech Stack and Commands

## Stack

- Next.js 16 (App Router) — see the `nextjs-16` steering doc before writing route code
- React 19 with the React Compiler (`babel-plugin-react-compiler`)
- TypeScript, strict. **Never** `any`. **Never** disable a TS or ESLint rule.
- Tailwind CSS v4, CVA, `tailwind-merge`
- Base UI (`@base-ui/react`) + shadcn/ui
- Prisma ORM 7 + PostgreSQL (`@prisma/adapter-pg`)
- Supabase — Auth, Storage, Realtime only. Never for database access.
- next-intl (no `[locale]` route segment; locale comes from a cookie)
- motion (Framer) for animation
- Bun as runtime, package manager, and test runner

## Package manager: Bun. Always.

```bash
bun install
bun add <pkg>
bun remove <pkg>
bun run <script>
bun test
bunx --bun <cli>
```

Never `npm`, `pnpm`, or `yarn`. There is no `package-lock.json` or `pnpm-lock.yaml` here —
`bun.lockb` is the lockfile.

## Verification gates — cheap, always allowed, run all four

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --check "src/**/*.{ts,tsx,css,json}"
```

Package scripts wrapping the same: `bun test`, `bun run typecheck`, `bun run lint`,
`bun run format:check`, `bun run format`.

These catch type errors, lint violations, formatting drift, and domain-logic regressions.
They do **not** catch layout, contrast, or overflow problems. When work is UI-visible, say
plainly that it is unverified visually and hand over a checklist (see `workflow-safety`).

## Database scripts

```bash
bun run db:generate   # prisma generate
bun run db:migrate    # prisma migrate dev
bun run db:deploy     # prisma migrate deploy
bun run db:push       # prisma db push
bun run db:studio     # prisma studio
```

## Adding UI components

Check whether shadcn/ui already ships it. If it does:

```bash
bunx --bun shadcn@latest add <component>
```

Never hand-recreate an existing shadcn component. Everything in `src/components/ui/` is
vendor code — never edit it. Customise by composition, wrappers, props, variants,
`className`, or slots.

## Local environment

Node 20+ required. `prisma generate` — and therefore `bun run build`, which chains it —
crashes on Node 18 with `ERR_REQUIRE_ESM`. If the shell resolves an older Node:

```bash
export PATH="$HOME/.nvm/versions/node/v22.17.0/bin:$HOME/.bun/bin:$PATH"
```

`bun` lives at `~/.bun/bin` and is not always on a non-interactive `PATH`.

## Formatting

Prettier is the source of truth: 4 spaces, double quotes, semicolons, trailing commas,
`printWidth` 100, LF. Always format modified files, organise imports, and delete unused
imports and variables.
