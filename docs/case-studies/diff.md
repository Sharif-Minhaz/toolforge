# Diff Checker — A Patch Nothing Can Read

`src/modules/diff/`. Read before touching the unified-patch writer or the row
model.

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

## Related

- [`../testing.md`](../testing.md#verifying-against-something-that-is-not-you) —
  the doctrine this is the second instance of.
