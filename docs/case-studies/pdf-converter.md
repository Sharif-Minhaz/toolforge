# Document to PDF

`src/modules/pdf-converter/`. Six formats in — HTML, Markdown, MDX, `.docx`,
`.pptx`, `.xlsx` — and a PDF out, laid out as real text in the reader's own tab.

The shape is [`../patterns/format-conversion.md`](../patterns/format-conversion.md)
stretched further than any other tool here stretches it: four readers, one
document model, two renderers, and an engine at the end that only runs where
there is a font to run it with. Everything below is what that cost.

---

## The seam is HTML, and four of the six formats meet at it

Markdown becomes HTML through Marked. MDX becomes Markdown and then HTML. A
Word document becomes HTML through Mammoth. HTML is already HTML. One reader —
`domain/read-html.ts` — turns all four into blocks, which means there is exactly
one answer to "what does a nested list inside a table cell become", instead of
four answers that agree until somebody changes one.

Only the two formats that are genuinely not documents get readers of their own:
a workbook is a grid, and a deck is a set of boxes at coordinates.

Decision tree 45 was applied twice with different answers, and both are worth
recording:

| Format           | Depended on, or written                                       | Why                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown, MDX    | [Marked](https://marked.js.org/)                              | CommonMark plus GFM is a specification with a settled implementation.                                                                                                                                                                                                                                                                                                               |
| HTML             | [node-html-parser](https://github.com/taoqf/node-html-parser) | The _input_ is authored by everybody — a scraper, a CMS, Word's own exporter. A hand-rolled tokeniser meets its first unclosed `<p>` in somebody's saved page.                                                                                                                                                                                                                      |
| `.docx`          | [Mammoth](https://github.com/mwilliamson/mammoth.js)          | A `.docx` is not one format. It is numbering definitions, a style hierarchy with inheritance, a relationship graph, and fifteen years of what Word emits rather than what ECMA-376 says.                                                                                                                                                                                            |
| `.xlsx`, `.pptx` | written, on `fflate` and `@xmldom/xmldom`                     | Narrow reads — sheet order, shared strings, cell values, shape transforms — consumed by nothing but this tool's own renderer. And the maintained alternative for spreadsheets is not maintained: SheetJS's last release on the public registry is `0.18.5` from 2022, because the project moved distribution off npm. Rule 45 says check who maintains it _before_ depending on it. |

---

## The trap the HTML / Markdown case study said would come round again

Turndown resolves a different DOM depending on which build a bundler hands it,
and [`html-markdown.md`](html-markdown.md) records the cost. Mammoth has the
same shape and it is worse, because the two builds do not merely _behave_
differently — they accept **different arguments**:

| Where               | Module             | Accepts                  |
| ------------------- | ------------------ | ------------------------ |
| Browser             | `browser/unzip.js` | `arrayBuffer` only       |
| Server / `bun test` | `lib/unzip.js`     | `path`, `buffer`, `file` |

Neither rejects the other's key with anything useful. Both reject with
`Could not find file in options`, which says nothing about which build is
running — the first `bun test` run failed on exactly that message with an
`arrayBuffer` that a browser would have accepted.

**The fix is to pass both keys.** The published type is a union of "browser
input" and "Node input", so it cannot express _both_, which is precisely what a
call that has to work wherever it resolves needs to say. `Object.assign` attaches
the second key to an object typed as the first, which keeps the call honest
without an assertion over the whole thing.

pdfmake has the same divergence in a second place. `addVirtualFileSystem` exists
only on the browser build; the Node build has no such method. But **both** builds
carry `virtualfs` itself, because `js/base.js` sets it in the constructor and the
browser's `fs` shim re-exports the same instance. So `virtualfs.writeFileSync` is
the one registration path that works everywhere, and it is the only reason this
module has one engine instead of two. `src/pdfmake-virtual-fs.d.ts` augments the
published types to say so.

---

## Two fonts, and neither is a superset of the other

A PDF has no fonts the way a web page does. Every glyph has to come from a font
embedded in the file, so the tool can only draw scripts it ships a font for:
Latin, Greek and Cyrillic from the Roboto pdfmake bundles, Bengali from Noto
Sans Bengali, and code from Roboto Mono. Both packs are fetched from `/fonts`
the first time a document needs one.

The defect this design exists to avoid was visible in the first rendered page.
**Noto Sans Bengali carries no Latin glyphs at all** — not a comma, not a full
stop, not a digit. Choosing one font for a paragraph is therefore impossible in
either direction:

```
paragraph font = NotoSansBengali  →  সংখ্যা▯ ০১২৩৪৫৬৭৮৯   (the colon is a box)
paragraph font = Roboto           →  ▯▯▯▯▯▯: 12          (the words are boxes)
```

`domain/font-runs.ts` splits at the character instead, and `render.ts` emits one
`pdfmake` text piece per run. Whitespace and the zero-width joiners are neutral
and extend whichever run they land in — a `ZWNJ` inside a conjunct is exactly
where a split would show.

### The danda cost a rendered page to find

Unicode files `।` (U+0964) and `॥` (U+0965) in the **Devanagari** block. They are
the full stop of Bengali, Odia, Gurmukhi and a dozen more, and Unicode's own
script property for them is `Common`. Classified by their block they resolved to
Roboto, which has no glyph for either, so every Bengali sentence in the first
test page ended in an empty box.

They are neutral characters in `domain/scripts.ts` now, which gives them the font
of the sentence they close. The general lesson is the one worth keeping: **a
Unicode block is not a script**, and shared punctuation is where the difference
shows up.

---

## A slide is a page, so the page controls are the deck's

Flattening a deck to a flow was the cheaper build and it produces something
nobody recognises. A slide _is_ its arrangement — a title against a diagram, two
columns compared, a caption under a photograph — and turning that into a bullet
list does not lose decoration, it loses the argument the slide was making.

So `read-pptx.ts` keeps every shape's `<a:xfrm>` box in English Metric Units and
the renderer places it with `absolutePosition`. Three parts of DrawingML earn
their lines:

- **Placeholder inheritance.** A slide reusing a layout's slot usually omits
  `<a:xfrm>` entirely, because the position is the layout's to decide. Without
  reading `slideLayoutN.xml` every such shape lands at the top-left corner,
  stacked on top of the others.
- **The group transform.** A group carries two boxes: where it sits, and the
  coordinate space its children were authored in. A child at `chOff.x` maps to
  the group's `off.x`, and every EMU of `chExt` maps to `ext / chExt` on the
  slide. Skip it and a grouped shape lands at its authoring coordinates, which
  on a scaled group is usually off the page.
- **`width` is a column property.** Setting it on a `stack` or a `table` does
  nothing, so every text box would run the full page width and overlap its
  neighbour. `placedAt` wraps each shape in a single-column `columns` block.

The consequence for the panel is that `pageSize`, `orientation`, `margin` and
`fontSize` have nothing to decide for a deck. They are **disabled with a
reason**, never hidden: a control that vanishes between two documents is a
control somebody hunts for. `appliesTo(option, format)` in `domain/convert.ts` is
the single predicate, shared by the panel, the article's options table, the
coercion an MCP call goes through, and the tests.

---

## One rule makes both table readers work

`pdfmake` refuses a ragged table: every row must hold the same number of
entries, and a spanning cell has to be followed by an empty object in each
position it covers. Neither source supplies that. HTML rows can be different
lengths and a `rowspan` leaves the row below one cell short; a spreadsheet
reader knows its merges up front and emits a **dense** grid with blanks in the
covered positions.

`domain/table-grid.ts` places cells over an occupancy map, and the rule that
reconciles the two is one line:

> A blank cell arriving at a covered slot is a placeholder, not content.

It is consumed rather than pushed sideways. Without it, every column after a
merged heading shifts one to the right. The second half of the same rule is that
placement advances by **one** column after a spanning cell rather than by its
`colSpan`, so the dense grid's own placeholders meet the check — while a short
HTML row, which has no such placeholders, steps over the span with its next real
cell.

---

## Where the layout is tested, and where it is not

The renderer produces a **plain object**. `pdfmake` is imported in exactly one
module, `domain/engine.ts`, and the font bytes it needs are injected. That seam
is what makes the layout testable: `tests/render.test.ts` asserts the document
definition field by field under `bun test`, with no canvas, no fonts and no
engine.

What that cannot catch is everything the engine refuses. A table whose row is
one cell short of its widths array, a `colSpan` running off the end, a font
declared but not loaded — all of them type-check perfectly and all of them throw
at `createPdf`. `tests/engine.test.ts` drives the real engine with a loader that
reads `public/fonts` off disk, which is also the server's half of the injection
and therefore the MCP adapter's path.

Two things no test here reaches, and both are named in the handover rather than
left to be discovered:

- **The browser's font loader**, which fetches the same files by the same names
  over HTTP rather than reading them off disk.
- **What Word, PowerPoint and Excel actually write.** `tests/fixtures.ts` builds
  minimal Open XML packages with `fflate`, which is what lets a test be _about_
  one element and lets a package be malformed on purpose. It is not a substitute
  for a real file, and it is the reason `.docx` sits on Mammoth rather than on a
  reader of ours.

The cross-check that is not us, per rule 27, is poppler: the sample pages were
rendered with `pdftoppm` and read back, which is how the danda and the
speaker-notes font size were both found.

---

## Two smaller notes

**The ink is a rule-24 exception.** A PDF has no stylesheet, no custom
properties and no dark mode — the reader may well print it — so a semantic token
has nothing to resolve against. `PDF_INK` in `render.ts` is the only raw palette
in the module and says why at the line.

**The speaker-notes heading is the one string the document itself carries.** The
domain layer has no catalogue and is not allowed one, so `PdfLabels` takes the
sentence from the caller and supplies the slide number. The page passes a
translated one; an MCP call, which has no locale, gets the English default.
