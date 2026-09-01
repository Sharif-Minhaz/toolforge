# Text Sorter — A Heuristic That Has to Say What It Did

`src/modules/sort/` puts pasted lines in order and writes them back as bullets or
numbers. Sorting is the easy half. The hard half is deciding what a line is.

---

## The problem the tool actually solves

A `<textarea>` soft-wraps for display without putting anything into the value, so
a line that merely _looks_ wrapped is already one line by the time `domain/` sees
it. Nothing needs defending there.

What does need defending is text that arrived carrying real newlines inside its
sentences — written in a mail client, copied out of a PDF, run through `fmt`.
Those newlines describe the width of a window that no longer exists. Split on
them and one paragraph becomes nine bullets.

So the split is a control (`splitMode`), not an implementation detail, and two
of its three settings are exact: `line` cuts at every newline, `paragraph` cuts
only at blank ones. Only `smart` guesses.

---

## What makes the guess safe

**Establish the wrap column before folding anything.** `detectWrapWidth` returns
a column only when **at least two lines** sit within ten characters of the
longest, and that longest is **at least forty characters**. No column, no folding
on length grounds — the tool degrades to `line` mode, which is a result the
reader can still use.

The two-line rule is the one that is easy to drop and expensive to lose:

```
apple
banana that has a really long description going on and on here
cherry
```

One long line among short ones is indistinguishable from a wrapped line and its
tail. Folding here would eat `cherry`. The conservative reading wins.

**Measure the previous _physical line_, never the item built so far.** This
shipped wrong once. Fold two lines together and the accumulated item is longer
than any wrap column, so every short line after it looks like a continuation and
gets swallowed. `splitSmart` keeps `previousLine` beside `items` for exactly this
reason, and `split.test.ts` pins it.

**A marker outranks every measurement.** `hasMarker(current)` vetoes the fold
first, because `2.` at the head of a line is a boundary somebody typed on
purpose. The trailing word-hyphen is the mirror image: it folds regardless of the
column, because no writer ends a list item on a hyphen.

**Report the decision.** `SplitReport` carries `joined` and `wrapWidth`, both of
which reach the counter under the box. A heuristic that never says what it did is
a heuristic nobody can trust or debug.

---

## Marker reading and marker writing are one fact

`markers.ts` holds both halves deliberately. Anything the tool can write it must
be able to strip back off, or re-listing its own output produces `1. - item`.
`markers.test.ts` asserts exactly that, over every style in `BULLET_MARKERS` and
`NUMBER_STYLES`.

The recognised set is wider than the written set — a paste comes from Word,
Notion or a Markdown renderer, each with its own bullet — and that width is what
makes the ordinal pattern delicate. It reads a **single** letter (`a.`) or a roman
numeral of **two or more** (`iv.`), which is what keeps `Mr.` and `So.` out of it.
A colon is not list punctuation, because `a: value` is YAML.

---

## Never `localeCompare`, never `Intl.Collator`

Collation data comes from the host's ICU. The server's copy and the reader's
browser can disagree about where `ä` sits, so a list ordered by the host can come
back in two different orders either side of hydration — a mismatch React reports
without ever naming the cause. Every comparator in `compare.ts` is written out
and deterministic, and `toLowerCase` is used rather than `toLocaleLowerCase` for
the same reason.

The cost is stated in the article rather than hidden: capitals sort before
lowercase under a case-sensitive sort, and accented letters land after unaccented
ones. `compare.test.ts` cross-checks against `Intl.Collator("en")` over ASCII
letters and digits only — the subset where the two cannot legitimately disagree.

---

## Shuffle: draw the seed, derive the arrangement

Randomness and a server-rendered result do not mix. The seed is drawn **on the
server** (`drawShuffleSeed`, page-level) and passed to the island as a prop; the
arrangement comes from `mulberry32` plus Fisher–Yates, which is pure and
identical in every runtime. Reshuffling draws a new seed **in a click handler**.
Drawing it in a `useState` initialiser would be the same hydration bug wearing a
hook.

It is not a cryptographic shuffle and does not claim to be —
`tools/domain/random.ts` is what to reach for when the order must be unguessable.

---

## Two rules that generalise past this module

1. **A heuristic ships with its own read-out.** Whatever it decided, the UI says
   so — how many lines were folded, at which column — and an exact alternative
   sits one click away.
2. **Order the pipeline once and write down why.** Markers off, then trim, then
   blanks, then duplicates, then sort, then markers back on. Every other
   ordering gives a different answer, and three of them give a wrong one: sorting
   before stripping sorts by the old numbering, numbering before sorting sorts
   the ordinals, and de-duplicating before trimming calls `item ` and `item` two
   different lines.
