# Specs

Kiro spec-driven work lives here, one directory per feature:

```
.kiro/specs/<feature-slug>/
  requirements.md   what and why — user stories with acceptance criteria
  design.md         how — data flow, module layout, types, edge cases
  tasks.md          discrete, checkable steps Kiro executes one at a time
```

Kiro creates and maintains these files. Do not hand-edit `tasks.md` while a task is running.

## Shape a ToolForge spec around the build order

The tool build order in `#adding-a-tool` maps almost one-to-one onto tasks. A spec for a new
tool should sequence roughly like this, and each task should be independently verifiable:

1. Register the id in `TOOL_IDS` and add the catalog entry as `status: "planned"`.
2. Add `tools.<id>.name` / `.description` to **both** `en.json` and `bn.json`.
3. Domain layer + `bun test` green — before any UI exists.
4. Zod schemas in `validation/`.
5. Route: `page.tsx` with `generateMetadata`, `JsonLd`, server-generated initial result.
6. `loading.tsx` skeletons matching the layout block for block.
7. Client island — small, state only.
8. Article — server component, semantic sections with stable ids.
9. Flip `status` to `"available"`, verify overview wiring.
10. Run the four gates; hand the visual checklist to the maintainer.

## Acceptance criteria that actually bite here

Good criteria for this codebase are the ones the gates can check or a reviewer can see:

- `bunx tsc --noEmit` passes — which also proves Bangla keys exist.
- Boundary cases are covered in `src/modules/<feature>/tests/`.
- No `console.*`; failures go through `logEvent`.
- Nothing outside `repository/` imports Prisma or Supabase.
- At 390px, `document.documentElement.scrollWidth === window.innerWidth`.

## What specs must never assume

A spec does not authorise `git commit`, `git push`, `next build`, `next dev`, or a headless
browser. Those need the maintainer's word, per run. See the `workflow-safety` steering doc.
