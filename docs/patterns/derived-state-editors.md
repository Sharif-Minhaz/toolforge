# A Tool That Edits Its Own Input

The URL Parser has two editors over one value: the URL box, and the query
parameter table underneath it. `src/modules/url-parser/` is the shape to copy
whenever a tool offers more than one way to change the same thing.

---

## The rules

- **One piece of state; everything else derived.** The URL string is the only
  `useState`. The parts list and the parameter rows come from `parseUrl(url)`
  during render, and a row edit writes back through `applyParams`. Two states
  held in step by an effect is the version that drifts, and it drifts on the
  input nobody tested.

- **A two-way editor cannot sit behind a debounce.** `useDebouncedValue` is the
  default for typed input and it is wrong here: the row inputs are controlled by
  the settled parse, so a keystroke would be reverted for 300 ms and then
  reappear. The rule it comes from is about expensive derivations, and this one is
  a single bounded `new URL()`. **Match the debounce to the cost**, and say in a
  comment why it is absent.

- **The blank row is not state either.** The table renders `params.length + 1`
  rows, `editParam` appends when the index lands past the end, and
  `buildQueryString` drops a pair with neither half. "Add a parameter" then needs
  no button and no draft object.

---

## `new URL()` is safe during render — and normalising

`new URL()` is the rare platform API that is safe to call during render on both
sides of hydration — it is specified rather than host-derived, unlike the
enumerations and zone-less dates in
[`../hydration-and-platform-pitfalls.md`](../hydration-and-platform-pitfalls.md).

What it _is_ is normalising: lowercased scheme and host, punycoded IDN, default
port dropped, empty path written as `/`. **Tell the reader when that changed
their text** instead of swapping it silently.

---

## Related

- [`../engineering-principles.md`](../engineering-principles.md#match-the-mechanism-to-the-cost)
  — the debounce decision tree, of which this is one branch.
- [`tree-editors.md`](tree-editors.md) — the same "pure function on a path"
  discipline when the value being edited is a nested structure.
