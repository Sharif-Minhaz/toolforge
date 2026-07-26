@AGENTS.md

# ToolForge Engineering Guidelines

ToolForge is a free developer and utility toolbox.

These rules are mandatory unless explicitly instructed otherwise.

---

# Tech Stack

- Next.js 16+
- React 19
- TypeScript (strict)
- Tailwind CSS v4
- Base UI
- shadcn/ui
- Prisma ORM
- PostgreSQL
- Supabase (Auth/Storage only)
- next-intl
- Bun
- Prettier
- ESLint

---

# General Principles

- Prefer simplicity and maintainability.
- Keep files focused on a single responsibility.
- Avoid unnecessary abstractions and duplicated logic.
- Use strict typing.
- Never use `any`.
- Never disable TypeScript or ESLint rules.

---

# Formatting

Prettier is the source of truth.

Always:

- Format modified files.
- Organize imports.
- Remove unused imports and variables.
- Keep naming consistent.

---

# Package Manager

Always use Bun.

```bash
bun install
bun add
bun remove
bun run
bun test
bunx
```

Never use npm, pnpm or yarn.

---

# UI Components

Before creating any UI component:

1. Check whether shadcn/ui already provides it.
2. If available, generate it:

```bash
bunx --bun shadcn@latest add <component>
```

Never manually recreate existing shadcn components.

### components/ui

Everything inside `components/ui` is vendor code.

Never modify it.

Customize only using:

- composition
- wrappers
- props
- variants
- className
- slots

---

# Component Rules

- Prefer Server Components.
- Use Client Components only for browser APIs, state, animations or event handlers.
- Keep client components as small as possible.

---

# Styling

Use:

- Tailwind CSS
- CVA
- tailwind-merge

Avoid custom CSS unless absolutely necessary.

Every feature must fully support:

- Light Mode
- Dark Mode

---

# Loading States

Every asynchronous page or component must expose a loading state.

### Rules

- Create `loading.tsx` for async App Router pages.
- Never show blank pages.
- Prefer skeletons over spinners.

Generate Skeleton if missing:

```bash
bunx --bun shadcn@latest add skeleton
```

Skeletons should closely resemble the final layout.

Support:

- Light Mode
- Dark Mode

For client mutations:

- disable actions while pending
- use optimistic UI when appropriate
- show inline loading indicators

Always expose appropriate:

- Loading
- Success
- Error
- Empty

Prefer Suspense boundaries for independently loading sections.

---

# Internationalization

Use `next-intl`.

Supported languages:

- English
- Bangla

Never hardcode UI text.

Use:

```tsx
t("settings.title");
```

---

# Server Architecture

Prefer:

```
Server Components
↓
Server Actions
↓
Route Handlers
```

Only use Route Handlers when required for:

- webhooks
- uploads
- streaming
- external APIs
- third-party callbacks

Do not create unnecessary REST endpoints.

---

# Database Rules

UI must never directly access:

- Prisma
- Supabase

Always go through the Domain Layer.

Example:

```
modules/users/

domain/
repository/
actions/
validation/
types/
```

Components call:

```ts
await getUsers();
```

not

```ts
prisma.user.findMany();
```

---

# Repository Layer

Only repositories may access:

- Prisma
- Supabase

Application code must never import either directly.

---

# Supabase

Use Supabase only for:

- Authentication
- Storage
- Realtime

Database access must always go through Prisma.

---

# Business Logic

Business rules belong in the Domain Layer.

Components should never contain business logic.

---

# Validation

Use Zod for:

- forms
- route params
- search params
- APIs
- Server Actions

Never trust client input.

---

# Testing

Every tool feature requires unit tests.

Focus on correctness, edge cases and regressions.

Do not chase coverage percentages.

Examples:

- Base64
- Hashing
- UUID
- JSON
- Regex

---

# Folder Structure

Use feature-first architecture.

```
modules/

base64/
actions/
components/
domain/
repository/
validation/
tests/
types/
```

Avoid dumping code into:

```
lib/
utils/
helpers/
```

---

# Error Handling

- Never swallow exceptions.
- Return typed errors.
- Show friendly messages.
- Log unexpected failures.

---

# Accessibility

Every feature must support:

- keyboard navigation
- focus states
- screen readers
- accessible labels

---

# Performance

Prefer:

- Server Components
- Suspense
- Streaming
- Lazy loading
- Dynamic imports

Avoid unnecessary client rendering and memoization.

---

# Security

- Validate all input.
- Escape user content.
- Never expose secrets.
- Never commit credentials.
- Use secure cookies.
- Apply CSRF protection where appropriate.
- Follow OWASP best practices.

---

# Code Quality

- Functions should do one thing.
- Prefer early returns.
- Avoid deep nesting.
- Use explicit names.
- Keep modules cohesive.
- Refactor duplication immediately.

---

# Logging

Do not leave:

```ts
console.log();
console.error();
```

inside production code.

Use structured logging.

---

# Pull Request Checklist

Every change must pass:

- Build
- TypeScript
- ESLint
- Prettier
- Unit Tests
- Light Mode
- Dark Mode
- English
- Bangla
- Accessibility
- Domain Layer
- Repository Layer

---

# AI Coding Rules

1. Think before writing code.
2. Reuse existing code before creating new abstractions.
3. Never bypass the Domain Layer.
4. Never access Prisma or Supabase outside repositories.
5. Never modify `components/ui`.
6. Prefer Server Components.
7. Prefer Server Actions over Route Handlers.
8. Update unit tests whenever business logic changes.
9. Localize every user-facing string.
10. Verify both Light and Dark modes.
11. Keep implementations simple.
12. Leave the codebase cleaner than you found it.
