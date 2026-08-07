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
