---
inclusion: always
---

# Working Rules — Ask First, Never Commit

The working tree belongs to the maintainer. These rules override convenience.

## Never run version-control writes unless that exact action was asked for in that message

- `git commit` (including `-a`, `--amend`, or inside a chained command)
- `git push`, `git tag`, or anything that writes to a remote
- `git checkout -b`, `git switch -c`, `git merge`, `git rebase`, `git stash`
- `gh pr create`, `gh pr merge`, `gh release create`
- any hook, alias, script, or `&&` chain whose net effect is one of the above

"Finish the feature", "make it work", or "clean it up" is **not** permission to commit.
Neither is a green test run. Asking once does not authorise the next one — permission is
per request.

Reading is always fine: `git status`, `git diff`, `git log`, `git show`.

When work is done, say what changed and let the maintainer decide what to record. Leave
changes staged at most, and only when asked.

## Ask before spending the machine's resources

Explicit permission is required **each time** — never start these unprompted:

- headless browsers of any kind (Chromium/Chrome via CDP, Playwright, Puppeteer) and any
  screenshot or visual-diff run
- long-lived dev servers (`next dev`, `bun run dev`) and production servers (`next start`)
- full production builds (`next build`, `bun run build`)
- anything else long-running, memory-hungry, or that spawns background processes

Ask once, plainly, and wait. Do not infer permission from an earlier "yes". If permission is
granted, clean up afterwards: stop every server and browser started, delete any screenshots
or scratch profiles.

## Without permission, verify statically

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bunx prettier --check "src/**/*.{ts,tsx,css,json}"
```

Then hand over the visual checklist instead of running a browser:

- light and dark
- English and Bangla
- 390px and 1440px
- sidebar expanded and collapsed
- at 390px, `document.documentElement.scrollWidth === window.innerWidth`
  (grid children need `min-w-0` or wide content blows out the page)

Say plainly that UI work has not been checked in a browser. Do not imply it was reviewed.

## Security

Validate all input. Escape user content. Never expose or commit secrets. Secure cookies.
CSRF protection where appropriate. OWASP best practices. `.env*` is gitignored — keep it
that way, and keep MCP tokens in `~/.kiro/settings/mcp.json`, not the workspace copy.

## Pull request checklist

Automated: TypeScript, ESLint, Prettier, unit tests, domain layer, repository layer.
Maintainer-checked, not automated: build, light mode, dark mode, English, Bangla,
accessibility.
