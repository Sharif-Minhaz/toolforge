# The Workbench Layout

Every tool's workbench answers three questions at a glance: where do I start,
what do I press, and where does the answer land. Readers told us the old shape —
one flat card, a title repeating the page header, options between the input and
the result, four outline buttons of equal weight — answered none of them.

The primitives live in `src/modules/tools/components/workbench-step.tsx`.
`html-markdown` and `bson` are the reference implementations; copy them.

## Order

```
[ core choices: mode, direction, format, the one parameter that matters ]
[ ▸ Options — everything a first result does not need, folded ]

  1 Input                          2 Result
  ┌──────────────────────┐   ⇄    ┌ RESULT_TRAY ──────────────┐
  │ the field             │        │ the output   [Copy] [⤓]  │
  └──────────────────────┘        └──────────────────────────┘
```

- **No card header.** The page header already names the tool; a second title
  inside the card is the first thing a reader has to skip.
- **`StepLabel step={1}`** on the entry point, **`StepLabel step={2}`** on the
  result. The stamped digit is the site's signature — use it for the path
  through a tool and nowhere else. Digits go through the formatter, so Bangla
  reads ১ and ২.
- **Step 1 takes the caret on arrival.** `StepLabel step={1}` with an `htmlFor`
  pointing at a text field focuses it after hydration (an effect, so the server
  HTML is untouched). It stands down on touch screens, on a `#section` address,
  when the reader is already typing, and for selects, file pickers and buttons.
  Give the step-1 label an `htmlFor` and the field gets this for free.
- **`RESULT_TRAY`** around a compact result: one raised surface so the end of
  the tool reads as a place. A field inside it takes `bg-card`. Large reports
  (the domain inspector's panels, the globe) label their heading `2` and skip
  the tray; never wrap an interactive canvas.
- **One filled button.** The press that produces the result (Generate, Inspect,
  Convert) when the tool needs one; otherwise the main result action (Copy).
  Everything else is `outline` or `ghost`.
- **`OptionsDisclosure`** for settings a first result does not need. Core
  choices stay visible. It is a native `<details>`, so keyboard and screen
  reader behaviour come from the platform.
- **Side by side from `lg`** when input and result are text panels of similar
  size: `lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]` with the swap button
  in the middle column. Stacked below `lg`, input first.
- A disclosure that data leaves the browser still sits above the controls
  (rule 32) — removing the card header never removes one.

## Generators and interactive tools

A generator with no input numbers its settings `1` and the output `2`. A single
interactive surface (a hex grid, a capture area) numbers its entry point and the
report the reader takes away, and changes nothing about how the surface works.

## Chrome around it

The workbench is quiet so the result can carry the page: one accent (`--primary`)
for selection and the filled button, neutral icon tiles (`TOOL_ICON_TILE`),
hairline borders, sentence-case labels, no glows, washes or hover lifts.
`--tool-accent` resolves to the same indigo for every tool inside a workbench.
Only the mock-server graph keeps per-kind hues (`CATEGORY_HUE_VARS`), because
there they mean something — see [`design-system.md`](../design-system.md).
