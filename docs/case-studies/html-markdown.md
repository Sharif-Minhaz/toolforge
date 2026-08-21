# HTML / Markdown Converter

`src/modules/html-markdown/`. Reads one notation and writes the other, in both
directions.

The two-notation shape is in
[`../patterns/format-conversion.md`](../patterns/format-conversion.md) — but note
where this tool leaves it. curl and BSON parse into a model this repo owns;
this one does not, because decision tree 45 says so. Both formats are read by
somebody else — GitHub, a static-site generator, whatever the reader pastes into
— so the parsers are depended on rather than written:
[Turndown](https://github.com/mixmark-io/turndown) writes the Markdown,
[Marked](https://marked.js.org/) writes the HTML, and this module is the options,
the divergences, and the seam between them.

Everything below is what that decision cost.

---

## A default rule that unwraps is a default rule that leaks

Turndown resolves an element by looking through its own rules, then the `keep`
list, then the `remove` list, and finally a **default rule that emits the
element's content without its tags**. It owns no rule for `<script>` or
`<style>`, so out of the box:

```
<p>before</p><script>alert(1)</script>  →  before

                                            alert(1)
```

A page's JavaScript becomes a paragraph of the article. So does a stylesheet's
selector list, and so does everything in `<head>`.

`STRIPPED_ELEMENTS` in `domain/constants.ts` is the divergence, and it is
deliberate under decision tree 46's third branch: no working client emits
`<script>` expecting it to be read as prose. The removal is registered as a
**filter function rather than a tag list**, so the pass that drops an element
also records that it did — `HtmlMarkdownSuccess.removed` is what keeps a
divergence from being a silent one, and the reader sees it in a `StatusStrip`
above the result.

**Two lists, not one.** `STRIPPED_METADATA_ELEMENTS` — `head`, `title`, `meta`,
`link`, `base` — goes without comment. A notice that fires on every page
carrying a `<meta charset>` is a notice nobody reads by the end of the week, and
head metadata was never prose. The script is the surprise; say only that.

---

## Which DOM the converter finds is a bundler's decision, not yours

Turndown needs a document to walk. Its `package.json` carries a `browser` field
that maps `@mixmark-io/domino` to `false` and swaps the entry point, so:

| Where               | Build                    | Parser             |
| ------------------- | ------------------------ | ------------------ |
| Browser             | `turndown.browser.es.js` | `window.DOMParser` |
| Server / `bun test` | `turndown.es.js`         | bundled `domino`   |

Both were probed and agree byte for byte. The unresolved one is the third case:
**the server-rendered pass of a client island**, which is compiled for Node but
belongs to the client layer, and which of the two builds it resolves is a
question about the bundler rather than about this code.

Getting it wrong is not a crash. `turndown.browser.es.js` loads fine with no
`document` — its parser probes are all inside `try` blocks — and only throws when
something is actually converted. That would surface as a refusal in the
server-rendered HTML and the real answer after hydration: a flash, and a
hydration mismatch.

So the island never asks. `page.tsx` converts once, where the answer is certain,
and passes `initialResult` down; the workbench holds a `touched` flag and calls
the converter only after the reader changes something, by which point it is
running in a browser that definitely has a parser. It costs one boolean and
saves the first conversion being done twice.

**If somebody verifies which build the SSR compilation resolves, this can go
back to the plain derive-during-render shape the Base64 tool uses.** Until then
the flag is the cheap side of the bet.

---

## The plugin is the maintained fork, and it needs a type shim

Turndown's own GFM plugin — tables, strikethrough, task lists — was last
published in 2018. `@joplin/turndown-plugin-gfm` is the same four rules, still
released, still dependency-free. Tables are the reason it is not optional:
without them Turndown flattens a table to the text of its cells, and a
comparison table becomes an unreadable run of words.

It ships no types, so `src/turndown-plugin-gfm.d.ts` declares them. That file
has **no top-level import** on purpose: `declare module` inside a module file is
an augmentation, and there is nothing to augment.

---

## One predicate, or the panel and the article drift

Nine controls, and each belongs to a direction — six describe how Markdown gets
written, two describe the HTML, and GFM is read by both because it changes what
each direction _understands_ rather than only what it emits.

`appliesTo(option, mode)` in `domain/convert.ts` is the single answer. The panel
hides a control by asking it; the article's caveat paragraph counts from it; the
tests assert it option by option. Two lists would have been shorter to write and
would have disagreed the first time a control moved.

`keepsCodeLanguage(options)` is the second one, and it is the case where a
choice costs something rather than disabling something. A fence can name the
language of the code inside it; four spaces of indentation is a block with
nowhere to put that name, so `language-ts` is gone from the result. The control
stays enabled — indented blocks are a legitimate thing to want — and its **hint
changes** to say what was traded. Trap 10's rule is "never silently ignore a
setting the reader switched on"; silence about a cost is the same defect
wearing a different hat.

---

## Round-tripping is the cross-check

Rule 27 asks for verification against something that is not you, and here the
two libraries are each other's check: a document written through Marked and read
back through Turndown has passed through two independent implementations of the
same specification. `tests/convert.test.ts` round-trips a document carrying every
GFM construct and asserts the bytes come back identical.

What that cannot check is Turndown's list indentation — it writes `-   one`,
three spaces, so nested items line up — which is valid CommonMark and survives
the round trip precisely because both ends agree. It will still look unfamiliar
next to a hand-written list. That is the reference implementation's choice, and
matching it is cheaper than owning a fork of it.
