# Highlighting a Textarea

`tools/components/code-editor.tsx`, `tools/components/code-block.tsx` and
`tools/domain/highlight.ts` are the one implementation. It started in the cURL
module and moved to `tools/` whole the moment the BSON converter needed one.

---

## Painting behind a textarea, and the alignment is the whole job

A `<pre>` holds the coloured copy, `absolute inset-0`, with the textarea's own
glyphs set to `text-transparent` and only its caret and selection left visible.
The textarea stays a real textarea, so undo, IME, autofill and screen readers are
untouched.

Four things hold the two in register, and each is a bug if it drifts:

- **One shared metrics constant**, not two class lists that match today. Font,
  size, line height, padding, wrap rule — `CODE_TEXT` and `CODE_PADDING`.
- **Both elements positioned.** An `absolute` child paints above a `static`
  sibling whatever the DOM order, so the textarea needs `relative` too or the
  backdrop swallows every click.
- **`scrollbar-gutter-stable` on both.** A classic scrollbar takes its width out
  of the content box, so the instant the textarea overflows it is narrower than
  the backdrop and every wrapped line breaks a word early.
- **A trailing `"\n"` in the backdrop**, or a value ending in a newline leaves the
  caret on a line the backdrop does not have.

### Line numbers go in the backdrop, never in the text

`lineNumbers` on `CodeEditor` widens a left padding that both elements share
(computed in `ch`, so it fits the widest number), and the backdrop switches to
one block per line with its number hung in that padding as generated content
(`content: attr(data-line)`). A wrapped line keeps one number because each block
wraps exactly as the textarea's own line does. The numbers can never reach the
clipboard: the selection belongs to the textarea, which never held them. In this
mode the trailing `"\n"` is not appended — a value ending in a newline already
splits into a last, empty row.

JSON rows are highlighted **one line at a time**. JSON has no token that crosses
a newline, so the colour is identical, but a row whose line did not change is not
rescanned — which is why a numbered JSON editor keeps its colour past
`MAX_HIGHLIGHT_LENGTH`. A language whose tokens can span lines is scanned whole
and cut with `splitTokenLines`.

---

## The highlighter is a different tokenizer from the parser

`highlight.ts`, not `tokenize.ts` — because the two want opposite things. The
parser resolves escapes and discards quotes; the highlighter **must return every
character it was given, in order.**

That is the invariant to test, over deliberately awkward input:

```ts
tokens.map((t) => t.text).join("") === input;
```

---

## No debounce; a length ceiling instead

Highlighting cannot be debounced when it sits behind a caret, so it needs a length
ceiling: above `MAX_HIGHLIGHT_LENGTH` it returns one plain token, because losing
the colour beats losing the typing.

Nor can the _language_ be debounced: it follows the live value, or a reader
switching notation watches the backdrop stay a language behind the glyphs for
300 ms.

---

## Read-only JSON: `JsonViewer`

Every JSON _output_ — the formatter, a GraphQL response, the BSON converter's
Extended JSON, a decoded JWT — renders through `tools/components/json-viewer.tsx`,
not `CodeBlock`. It adds three things a long document needs, and two a caller
opts into:

- **Virtualized rows.** Rows are a fixed `24px` and never wrap, so the visible
  slice is arithmetic on `scrollTop`; only that slice is in the DOM, and each row
  highlights its own line. This replaced a whole-document ceiling that turned a
  700 KB result monochrome. The cost: find-in-page and select-all see only the
  rendered rows, so a viewer always sits next to a Copy button.
- **Folding.** `findJsonFolds` in `domain/json-outline.ts` pairs brackets on the
  text (string-aware, never throws) and keeps one fold per line — the outer one
  when `[{` share a line. A collapsed fold renders as one row, `"key": {…},`.
- **Line numbers in a sticky gutter**, as generated content in a column of their
  own, so dragging across the code copies only the code.
- **Search** (`searchable`). The browser's find cannot see unrendered rows, so
  the viewer has its own: `domain/line-search.ts` finds matches as line and
  column, `markTokens` cuts the coloured tokens at match edges so a match keeps
  its colour and only gains a background, and `revealRange` opens every fold a
  match is hiding in before the row is scrolled to. Matching is case-insensitive
  through a regular expression, never by lowercasing a copy — `"İ"` lowercases
  to two code units and would shift every later column. Ctrl+F inside the viewer
  opens it; it searches as you type, with no debounce (a filter over text already
  in memory).
- **Full screen** (`fullscreenTitle`). The same toolbar and rows move into a
  bottom `Sheet` sized to the window, as the hex editor and Markdown do. All
  state lives in `JsonViewer` above both places, and the scroller is attached by
  a callback ref that restores the last offset, so folds, search and position
  survive the move.

---

## Adding a language

A new language is a scanner and nothing else, and the round-trip invariant is what
makes it cheap — the shared test already loops over `HIGHLIGHT_LANGUAGES`, so a
new member is covered by every awkward input in the list the moment it joins the
union.

That is what caught both defects in the TOON scanner: whitespace emitted twice,
and a delimiter inside a quoted value splitting the string it was quoted to
protect. Two rules fall out:

- **Never split on a separator before honouring quotes.** The quoting exists
  precisely because the separator appears inside values.
- **`plain` is a language**, not the absence of one. A notation with no structure
  worth colouring (base64, a digest) names a value instead of making every caller
  branch around the component.

---

## Related

- [`../design-system.md`](../design-system.md#tokens) — why code uses
  `--syntax-*` and never `--brand-*`.
- [`../engineering-principles.md`](../engineering-principles.md#match-the-mechanism-to-the-cost)
  — the debounce decision tree.
