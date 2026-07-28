---
inclusion: fileMatch
fileMatchPattern: "src/modules/**/*.ts"
---

# Testing

Every tool feature requires unit tests. Run with `bun test`. Tests live in
`src/modules/<feature>/tests/*.test.ts` and import through the `@/` alias.

Focus on correctness, edge cases, and regressions. Do not chase coverage percentages.

Test the **domain layer**, not the markup:

- generation and transformation logic (per version, per mode)
- boundary validation (min, max, off-by-one, `NaN`, fractional, negative)
- serialisation for every export format, including the empty case
- typed-result helpers (`copyText`, `saveFile`) via injected fakes

Two conventions worth keeping:

- Prefer a typed `for…of` loop over `test.each`. Bun's `test.each` types the callback
  parameter as `unknown`, which forces casts.
- Anything that touches the DOM or clipboard takes its dependency as a parameter with a
  browser default (`copyText(text, clipboard = …)`), so tests pass a fake instead of needing
  a DOM.

Update unit tests whenever business logic changes. Get `bun test` green **before** writing
any UI for a new tool.
