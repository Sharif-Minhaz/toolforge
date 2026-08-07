# Design System

Tokens live in `src/app/globals.css`. Use them; do not introduce raw colours.

---

## Tokens

- **Semantic tokens** (`--background`, `--card`, `--muted-foreground`, …) are
  defined for both themes. Dark mode is a separate palette, not an inversion.
- **Five accents:** `--brand-{violet,cyan,amber,rose,emerald}`. A component opts
  in by applying `TOOL_ACCENT_VARS[accent]`, which sets `--tool-accent`; every
  tinted surface then reads that one variable.
- **Five syntax colours:** `--syntax-{string,number,keyword,key,call}`, for code
  and nothing else. They exist because the brand hues are **not** usable as
  foreground text at 13px: on a near-white card in light mode `--brand-amber`
  measures 2.8:1 and `--brand-cyan` 3.4:1, both under the 4.5:1 small text needs.
  The syntax set is darker at the same hue angles and clears 4.5:1 on every
  surface code sits on, in both themes. Reaching for `text-brand-*` inside a code
  block is the mistake this family exists to prevent — and the general rule it
  comes from is that **a token tuned for a chip is not thereby tuned for body
  text.**
- **Custom utilities:** `bg-grid`, `panel-sheen`, `text-gradient`. From the
  shadcn preset: `scroll-fade-*`, `shimmer`, `no-scrollbar`.
- **Radii** scale from `--radius: 0.7rem`. Cards use `rounded-2xl`, controls
  `rounded-xl`, small chips `rounded-lg`.

The one place a raw colour literal is correct is a canvas paint colour that sits
over the reader's own photograph rather than over a themed surface. Say so in a
comment where you write it — see
[`case-studies/watermark-remover.md`](case-studies/watermark-remover.md).

---

## Motion

- `motion` (Framer). 200–300 ms, ease `[0.22, 0.61, 0.36, 1]`; springs for
  shared-layout indicators only.
- Shared-layout indicators need a unique `layoutId`. Components rendered in both
  the desktop rail and the mobile drawer take a `layoutIdPrefix` prop — duplicate
  ids make the indicator jump between the two copies.
- Respect `useReducedMotion()`; return the plain element rather than animating.

### Animating a server component

`motion/react` is client-only. Importing it into a server component turns that
component — and everything it renders — into client code. So the animated element
is always a client component. The only question is how thin you keep the boundary
around it.

The answer is a **client wrapper**: a small `"use client"` component that renders
the `motion` element and takes `children`. The server component imports the
wrapper, not `motion`. Children stay server-rendered and pass straight through
the RSC boundary.

Everything lives in `src/components/motion/`:

- `motion-tokens.ts` — `MOTION_EASE`, `MOTION_DURATION`, `MOTION_STAGGER`,
  `staggerDelay()`. Framework-free, so server and client read the same numbers.
  Never import React or `motion` here.
- `reveal.tsx` — `Reveal` (fades up on scroll into view) and `FadeIn` (fades in
  on mount, for above-the-fold content). Both carry the reduced-motion gate.
- `motion-primitives.tsx` — `MotionDiv`, the escape hatch for a one-off neither
  wrapper covers. It has no reduced-motion gate, so you own accessibility when
  you use it. Need another tag? Add a sibling export.

Rules:

- A server component may import `Reveal`, `FadeIn`, `MotionDiv` and the tokens.
  It may never import `motion/react`.
- Reach for `Reveal` or `FadeIn` before `MotionDiv`, and `MotionDiv` before a new
  bespoke wrapper. A new wrapper needs a reason the existing three cannot cover.
- **Never use `motion/react-client`.** It looks like it animates from a server
  component; it does not. It resolves to `framer-motion/client`, whose module
  already carries `"use client"` — same bundle, same boundary. What it costs you:
  every `initial`/`animate`/`transition` object is serialised into the RSC
  payload on every render of every element, and a server component cannot call
  `useReducedMotion()`, so the accessibility gate is unreachable.
- Pass `as` when the wrapper sits somewhere a `<div>` is invalid. A wrapper
  directly inside `<ul>` must be `as="li"` — otherwise the markup is invalid and
  screen readers drop the list semantics. The reduced-motion branch honours `as`
  too.
- Stagger with `staggerDelay(index)`, never inline arithmetic. It caps the delay
  so a long list does not leave the last card waiting a full second.
- Read durations from `MOTION_DURATION` and easing from `MOTION_EASE`. A literal
  `[0.22, 0.61, 0.36, 1]` anywhere outside `motion-tokens.ts` is a bug.

```tsx
// server component — no "use client", no motion import
import { staggerDelay } from "@/components/motion/motion-tokens";
import { Reveal } from "@/components/motion/reveal";

<ul className="grid gap-3 sm:grid-cols-2">
    {tools.map((tool, index) => (
        <Reveal key={tool.id} as="li" delay={staggerDelay(index)} className="h-full">
            <ToolCard tool={tool} />
        </Reveal>
    ))}
</ul>;
```

If you want a genuinely smaller bundle, the lever is `m` + `LazyMotion`, not the
import path. Neither wrapper style changes how much JS ships.

---

## Interaction

### Bringing a result into view

**A result produced by a press has to be brought into view.** A workbench card
plus its options is most of a laptop viewport, so the answer to the button you
just pressed lands below the fold and the page looks as though nothing happened.
`useResultScroll` from `tools/components/use-result-scroll.ts` is the one
implementation: put its `ref` on the result wrapper, call `scrollToResult()` from
the handler, and add `scroll-mt-6` so the target does not sit flush against the
viewport edge.

Three rules it encodes, and none of them is optional if you hand-roll it instead:

- **Wait a frame.** The element does not exist at the moment the handler sets
  state; a `requestAnimationFrame` runs after React commits, so the target is
  measurable by the time it is scrolled to.
- **Never scroll something already on screen.** Yanking the page when the answer
  is already visible is worse than not scrolling. The hook skips when the target
  is at least 40% in view.
- **Honour `prefers-reduced-motion`.** Smooth scrolling is vestibular motion. The
  query is read at call time, not at render, so a reader who changes the setting
  mid-session is respected without a re-render.

Call it where the result _appears_ — for most tools, inside the success branch,
after the early return that handles failure. **Only for discrete actions**, never
for a derived-during-render result, where it would drag the page on every
keystroke.

### Never scroll to a destination that can turn out empty

The Domain Inspector and the Port Scanner both scroll when the scan _starts_,
because `tools/components/scan-radar.tsx` mounts in that same commit and watching
the sweep beats watching a gap — and that bought a bug: an unparseable hostname
left the reader parked at a blank slot with the reason sitting off-screen beside
the input they had to fix.

Scrolling early is allowed, but only with both halves of the fix:

- **Reject what you can reject before moving the page.** `checkHostSyntax` lives
  apart from `hostname.ts` precisely so the island can run it without pulling
  `tldts` and its suffix list into the bundle. A typo then costs no Turnstile
  token, no round trip, and no scroll.
- **Render the remaining failures at the destination.** A lookup that started and
  then failed says so in the result slot, not only in the status strip beside the
  field. Arriving somewhere empty and having to scroll back to learn why is what
  makes the whole gesture feel broken.

The split is worth copying: **a complaint about the _input_ belongs beside the
input and must not move the page; a complaint about the _operation_ belongs where
the answer would have been.**

### Other interaction rules

- Hover-only affordances must stay reachable without a pointer. Gate them on
  `[@media(hover:hover)]` and pair with `focus-visible:opacity-100`.
- Never disable a rule to satisfy `react-hooks/set-state-in-effect`. Use a ref
  for deferred imperative work, `useIsHydrated()` for hydration-gated UI, or an
  event handler.
- Base UI `Button` expects a real `<button>`. For navigation use
  `<Link className={cn(buttonVariants(), …)}>`, not `<Button render={<Link/>}>`.
- Every verdict on this site appears in a `StatusStrip` under its control — see
  [`patterns/input-limits.md`](patterns/input-limits.md).
- Prose caps at `max-w-[68ch]`; tables break out inside `overflow-x-auto`.
