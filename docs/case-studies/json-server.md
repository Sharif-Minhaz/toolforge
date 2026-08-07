# JSON Server Studio — Cloning a Behaviour, Not a Format

`src/modules/json-server/` reimplements `json-server` v1 as one pure engine, and
hosts it behind a two-tier size ceiling.

The ceiling is [`../patterns/growth-ceilings.md`](../patterns/growth-ceilings.md).
This file is about the compatibility layer.

---

## Seven behaviours that 160 hand-written tests missed

This is the fifth instance of "verify against something that is not you", and it
moves the rule from _formats_ to _behaviour_. Nothing here is byte-exact; what has
to match is what a request returns.

160 hand-written tests passed while **seven** behaviours were wrong — every one of
them a case where a fixture would work locally and behave differently once hosted,
which is the single defect a compatibility layer cannot have:

1. `sort-on` compares strings with **`localeCompare`**, so `"a title"` precedes
   `"Tenth"`; a code-unit comparison puts every capital first.
2. …and it sorts **falsy values last ascending, except `0`** — so `?_sort=draft`
   leads with the drafts.
3. `_per_page=0` clamps to **one**, not to the default of ten.
4. `_per_page` **alone is not pagination**; the envelope needs `_page`.
5. `_embed` runs **before** filtering and sorting, which is the only order that
   lets `?_embed=post&_sort=post.title` reach the embedded field.
6. `_embed=post` **pluralises** to find `posts`. Reading `document["post"]` finds
   nothing on every real fixture.
7. `DELETE` **nulls the foreign keys** pointing at the deleted row, whether or not
   `_dependent` was passed.

---

## Three rules that generalise from it

### The independent implementation can be the library you are cloning, driven without its server

`npm i json-server` in a scratch directory, import its `Service` class and the
query-string mapping out of its own `lib/app.js`, and run both engines over one
document.

No port, no dependency added to this project, and 74 request/response pairs
compared in a file that is deleted afterwards. What stays in the repository is
`tests/reference-parity.test.ts` — the _results_, pinned, with each one saying
which behaviour it caught.

### Diverge only on malformed input, and say so

A well-formed query behaves exactly as the reference does. The three deliberate
differences are all about input no working client sends:

| Case | Reference | Here |
| --- | --- | --- |
| `_where` that is not JSON | silently drops the filter, returns the whole collection | **400** |
| Unknown `:operator` | silently drops the filter | **400** |
| Bare `{"views": 100}` clause | matches nothing | honoured |

The first two are refusals, the third is strictly additive. **None of them can
change what a correct client sees.**

### Matching a defect is sometimes right

A nested `_where` clause against a field that is not an object _passes_ in the
reference — a filter matching rows it was asked to exclude. That is matched
anyway, and the comment says why: this is a clone, and imposing a judgement about
which behaviour is nicer is exactly what makes a hosted fixture disagree with a
local one.

Compare [`blurhash.md`](blurhash.md), where the defect was in a control the reader
turns and matching it would have been wrong.

**The question is not "is this a bug" but "would diverging make the two disagree
on something somebody actually does".**

---

## A naive inflector is fine here, and is not fine next door

`fieldsOf` samples fifty records, and `posts` → `postId` singularises naively —
because a wrong guess costs one `_embed` that comes back empty.

The GraphQL studio inherits neither licence: there the same guess becomes a
published type name. See [`graphql-server.md`](graphql-server.md).

---

## Related

- [`../testing.md`](../testing.md#verifying-against-something-that-is-not-you)
- [`../architecture.md`](../architecture.md#worked-example-two-the-three-studios-which-moved-twice)
  — the document layer this shares with the GraphQL studio, and the promise that
  one `db.json` behaves identically in both.
