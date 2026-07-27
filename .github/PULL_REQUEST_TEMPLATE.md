## What changed

<!-- One or two sentences. Link the issue if there is one: Closes #123 -->

## Why

<!-- The reasoning that is not obvious from the diff. Skip if it genuinely is obvious. -->

## Checks

<!-- All required. See CONTRIBUTING.md#before-you-open-a-pull-request -->

- [ ] `bun test`
- [ ] `bunx tsc --noEmit`
- [ ] `bunx eslint .`
- [ ] `bunx prettier --check "src/**/*.{ts,tsx,css,json}"`
- [ ] `en.json` and `bn.json` still match key for key
- [ ] Branched from `main`, not committed to it
- [ ] Commits use Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, …)

## If an AI agent wrote any of this

<!-- Fine to use one. See CONTRIBUTING.md#using-an-ai-coding-agent -->

- [ ] It was given `CLAUDE.md` and `AGENTS.md`
- [ ] It followed `.agents/skills/add-tool/SKILL.md` for tool work
- [ ] I have read every line I am submitting

## If this touches the UI

- [ ] Light mode and dark mode
- [ ] English and Bangla
- [ ] 390 px and 1440 px
- [ ] Sidebar expanded and collapsed
- [ ] No horizontal page scroll at 390 px
- [ ] Keyboard reachable, focus visible

## If this changes a tool's controls

- [ ] Article options table and caveats updated
- [ ] `meta.description` and `hero.subtitle` still describe the tool accurately
- [ ] `loading.tsx` skeleton still matches the layout
- [ ] Both locales updated for all of the above

## Anything you could not verify

<!-- Say so plainly. An honest gap is more useful than an unverified claim. -->
