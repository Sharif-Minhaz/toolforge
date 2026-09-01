# Diff Checker — A Patch Nothing Can Read

`src/modules/diff/`. Read before touching the unified-patch writer, the row
model, or the viewer's markup.

---

## The independent implementation was already on the machine

Piping every generated patch through **`patch(1)`** in a throwaway script found
two shapes of input that `git apply` would have rejected outright.

A hand-written applier in the test file had passed both — because it had inherited
the assumption it was supposed to be checking. That is the trap: a checker you
wrote from the same understanding as the code under test cannot find an error in
the understanding.

---

## A format's idea of a line may differ from yours by exactly one

The row model shows a text ending in a newline as having a **final empty line**,
because a reader expects to see it.

A unified diff counts **one line fewer**, and marks any side whose last line lost
its ending with `\ No newline at end of file`.

Either model alone is coherent. A hunk header counted in one and applied in the
other is a patch nothing can read.

**When you emit a format, write down which model each side of the boundary uses
before writing the converter.**

And note the consequence that is easy to miss: a _context_ line means identical in
both files, **terminator included**, so a final line the two sides end differently
has to be printed as a removal and an addition instead.

---

## What a screen reader hears, a clipboard should not get

The result is a `<table>`, and everything in it is real DOM: line numbers, the
`-`/`+` signs, a `sr-only` label naming each row's change, a `sr-only` "no line
on this side" stand-in for the empty half of a split row, and the `≈` ignored
marker. A browser copies what it walked, so dragging over three removals pasted:

```
MCP_IP_SALT=…	No line on this side
RemovedMCP_ACCESS_TOKEN=…
```

`user-select: none` already hid the numbers and the signs from the clipboard in
Chromium, which is why they were missing and the labels were not — it is a
rendering hint, applied unevenly across engines, and reaching for it again would
have been guessing.

**Markup written for a listener is not the text a paste should carry, and the fix
is to say which is which rather than to delete one of them.** Content cells are
marked `data-diff-copy`, everything that only stands in for something is marked
`data-diff-noise`, and a `copy` handler on the viewer frame rebuilds the
clipboard from the cloned selection: drop the noise, read the content cells row
by row, hand the rows to `toSelectionText`. The accessible names stay exactly
where they were.

Two things fall out of the row model rather than the DOM, and both are in
[`../../src/modules/diff/domain/selection.ts`](../../src/modules/diff/domain/selection.ts):

- An empty cell is dropped, not padded. In the split view it is the side with no
  line at all, so a run of removals pastes as a run of lines.
- **A split row repeats an unchanged line in both columns.** The reader selected
  one line and expects one, so a cell equal to the one beside it collapses.
  Two sides that differ — a replacement, or a pair `ignoreCase` called equal —
  both survive, tab-separated the way the columns read.

Gap markers leave no line behind: they count lines rather than being one.

---

## Related

- [`../testing.md`](../testing.md#verifying-against-something-that-is-not-you) —
  the doctrine this is the second instance of.
