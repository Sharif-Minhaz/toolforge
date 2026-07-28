---
inclusion: fileMatch
fileMatchPattern: "src/**/*.{tsx,css}"
---

# Design System, Motion, Interaction

Tokens live in `src/app/globals.css`. Use them; never introduce raw colours.

- Semantic tokens (`--background`, `--card`, `--muted-foreground`, …) are defined for both
  themes. Dark mode is a separate palette, not an inversion.
- Five accents: `--brand-{violet,cyan,amber,rose,emerald}`. A component opts in by applying
  `TOOL_ACCENT_VARS[accent]`, which sets `--tool-accent`; every tinted surface then reads
  that one variable.
- Custom utilities: `bg-grid`, `panel-sheen`, `text-gradient`. From the shadcn preset:
  `scroll-fade-*`, `shimmer`, `no-scrollbar`.
- Radii scale from `--radius: 0.7rem`. Cards `rounded-2xl`, controls `rounded-xl`, small
  chips `rounded-lg`.

Styling uses Tailwind + CVA + `tailwind-merge`. Avoid custom CSS unless unavoidable. Every
feature supports light and dark.

## Motion

- `motion` (Framer). 200–300ms, ease `[0.22, 0.61, 0.36, 1]`; springs only for shared-layout
  indicators.
- Shared-layout indicators need a unique `layoutId`. Components rendered in both the desktop
  rail and the mobile drawer take a `layoutIdPrefix` prop — duplicate ids make the indicator
  jump between the two copies.
- Respect `useReducedMotion()`; return the plain element rather than animating.

### Animating a server component

`motion/react` is client-only. Importing it into a server component turns that component —
and everything it renders — into client code. The animated element is always a client
component; the question is only how thin the boundary is.

The answer is a **client wrapper**: a small `"use client"` component that renders the
`motion` element and takes `children`. The server component imports the wrapper, not
`motion`. Children stay server-rendered and pass straight through the RSC boundary.

Everything lives in `src/components/motion/`:

- `motion-tokens.ts` — `MOTION_EASE`, `MOTION_DURATION`, `MOTION_STAGGER`, `staggerDelay()`.
  Framework-free, so server and client read the same numbers. Never import React or
  `motion` here.
- `reveal.tsx` — `Reveal` (fades up on scroll into view) and `FadeIn` (fades in on mount,
  for above-the-fold content). Both carry the reduced-motion gate.
- `motion-primitives.tsx` — `MotionDiv`, the escape hatch for a one-off neither wrapper
  covers. It has no reduced-motion gate, so you own accessibility when you use it. Need
  another tag? Add a sibling export.

Rules:

- A server component may import `Reveal`, `FadeIn`, `MotionDiv`, and the tokens. It may
  never import `motion/react`.
- Reach for `Reveal` or `FadeIn` before `MotionDiv`, and `MotionDiv` before a new bespoke
  wrapper. A new wrapper needs a reason the existing three cannot cover.
- **Never use `motion/react-client`.** It looks like it animates from a server component; it
  does not. It resolves to `framer-motion/client`, whose module already carries
  `"use client"` — same bundle, same boundary. What it costs you: every
  `initial`/`animate`/`transition` object is serialised into the RSC payload on every render
  of every element, and a server component cannot call `useReducedMotion()`, so the
  accessibility gate is unreachable.
- Pass `as` when the wrapper sits somewhere a `<div>` is invalid. A wrapper directly inside
  `<ul>` must be `as="li"` — otherwise the markup is invalid and screen readers drop the
  list semantics. The reduced-motion branch honours `as` too.
- Stagger with `staggerDelay(index)`, never inline arithmetic. It caps the delay so a long
  list does not leave the last card waiting a full second.
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

If you want a genuinely smaller bundle, the lever is `m` + `LazyMotion`, not the import
path. Neither wrapper style changes how much JS ships.

## Interaction and accessibility

- Hover-only affordances must stay reachable without a pointer. Gate them on
  `[@media(hover:hover)]` and pair with `focus-visible:opacity-100`.
- Never disable a rule to satisfy `react-hooks/set-state-in-effect`. Use a ref for deferred
  imperative work, `useIsHydrated()` for hydration-gated UI, or an event handler.
- Base UI `Button` expects a real `<button>`. For navigation use
  `<Link className={cn(buttonVariants(), …)}>`, not `<Button render={<Link/>}>`.
- Keyboard navigation, focus states, screen readers, accessible labels — every feature.
- Live input conversions debounce at 300ms; button clicks stay instant.
