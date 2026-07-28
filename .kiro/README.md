# Kiro setup for ToolForge

This directory configures [Kiro](https://kiro.dev) for this repository. It mirrors the rules
already written in `CLAUDE.md` and `AGENTS.md`, split by concern so Kiro only loads what a
given file actually needs.

```
.kiro/
  steering/     project rules Kiro reads as context
  hooks/        agent hooks — file-edit triggers and one manual button
  settings/     workspace MCP servers
  specs/        spec-driven feature work (requirements → design → tasks)
```

## Steering

| File                 | Inclusion                               | Covers                                                   |
| -------------------- | --------------------------------------- | -------------------------------------------------------- |
| `product.md`         | always                                  | what ToolForge is, tool catalog, non-negotiables         |
| `tech.md`            | always                                  | stack, Bun commands, verification gates, Node 20+ gotcha |
| `structure.md`       | always                                  | folder layout, layering, server/client split, errors     |
| `nextjs-16.md`       | always                                  | read `node_modules/next/dist/docs/` before route code    |
| `workflow-safety.md` | always                                  | never commit/push; ask before dev server, build, browser |
| `i18n.md`            | fileMatch `src/**/*.{tsx,json}`         | next-intl, cookie locale, catalogue parity, Bangla type  |
| `design-system.md`   | fileMatch `src/**/*.{tsx,css}`          | tokens, accents, motion wrappers, interaction rules      |
| `testing.md`         | fileMatch `src/modules/**/*.ts`         | bun test conventions, what to test                       |
| `data-layer.md`      | fileMatch repository / actions / prisma | Prisma and Supabase boundaries, server actions, logging  |
| `adding-a-tool.md`   | manual — type `#adding-a-tool`          | the nine-step build order for a new or reworked tool     |

Editing steering: keep `always` docs short. Anything long or narrow belongs behind a
`fileMatch` pattern or `manual` inclusion, otherwise it burns context on every request.

**Keep these in sync with `CLAUDE.md`.** `CLAUDE.md` is still the canonical rulebook for the
repo — when a rule changes there, mirror it into the matching steering doc.

## Hooks

| Hook              | Trigger                             | Does                                                    |
| ----------------- | ----------------------------------- | ------------------------------------------------------- |
| `locale-parity`   | edit `src/messages/*.json`          | diffs `en.json` against `bn.json`, fills missing keys   |
| `domain-tests`    | edit `src/modules/*/domain/**/*.ts` | checks tests exist, runs `bun test`                     |
| `vendor-ui-guard` | edit `src/components/ui/**/*.tsx`   | flags vendor edits, proposes a wrapper instead          |
| `verify-gates`    | manual button                       | runs the four cheap checks, prints the visual checklist |

Every hook prompt ends with "do not commit anything" on purpose. Toggle a hook with
`"enabled": false`, or from the Kiro hooks panel.

## MCP

`settings/mcp.json` is workspace-level and **committed** — it must never contain a secret.

- `shadcn` — enabled, read-only registry lookups auto-approved.
- `prisma` — disabled by default. Enable when doing schema or migration work.
- `supabase` — disabled, `--read-only`, and `SUPABASE_ACCESS_TOKEN` left blank on purpose.

Put real tokens in the **user-level** config at `~/.kiro/settings/mcp.json`, which is outside
the repo. A server defined in both places: the workspace entry wins.

MCP servers reload when the config is saved; no Kiro restart needed.

## Also present in this repo

- `CLAUDE.md` / `AGENTS.md` — Claude Code
- `.agents/skills/` — vendored skill docs (prettier-ignored)
- `.vscode/settings.json` — Prettier on save, 4-space tabs, ESLint fix on save. Kiro reads
  VS Code settings, so formatting behaviour carries over.
