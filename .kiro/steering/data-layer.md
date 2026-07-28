---
inclusion: fileMatch
fileMatchPattern: "{prisma/**,src/modules/**/repository/**,src/modules/**/actions/**,src/lib/**}"
---

# Data Layer — Prisma, Supabase, Server Actions

## Only repositories may import Prisma or Supabase

Application code — components, hooks, domain, presenters — must never import either.

```
modules/<feature>/
  domain/
  repository/     ← the only place `@prisma/client` or `@supabase/*` appears
  actions/
  validation/
  types/
```

Components call:

```ts
await getUsers();
```

not:

```ts
prisma.user.findMany();
```

`src/lib/` holds `cn` and the Prisma/Supabase clients only. Do not add to it.

## Supabase scope

Auth, Storage, Realtime. **Never** database access — that always goes through Prisma.

## Server Actions

`"use server"` files live in `modules/<feature>/actions/`. Every payload is Zod-validated in
`modules/<feature>/validation/` before it reaches a repository. Never trust client input.

Prefer Server Actions over Route Handlers. Route Handlers only for webhooks, uploads,
streaming, external APIs, and third-party callbacks.

## Errors and logging

Never swallow exceptions. Return typed errors and show friendly messages. No `console.*` —
use `logEvent` from `src/modules/observability/domain/logger.ts`:

```ts
logEvent("error", "uuid.download_failed", { format, error: describeError(err) });
```

It emits one JSON line per event so browser and server output can be filtered without
parsing free-form strings.

## Migrations

```bash
bun run db:migrate    # dev
bun run db:deploy     # prod
```

`prisma/migrations/` is prettier-ignored — do not reformat it. `prisma generate` needs
Node 20+ (see the `tech` steering doc).
