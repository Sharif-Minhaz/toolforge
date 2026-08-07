# A Tree Editor Over a Recursive Union

`src/modules/mock-server/domain/value-edit.ts` and its `ValueRow` component are
the shape to copy whenever a reader has to build a nested structure without typing
its syntax.

---

## Every operation is a pure function on a path

Add, remove, rename, duplicate, reorder, change kind — each is a function taking
`(root, path, …)` and returning a new root, so the whole interaction surface is
unit-tested with no DOM. The component is a renderer and nothing more.

**A path is a list of _steps_ rather than a dotted string**, because a tree over a
union descends in several different ways — into an object field, into an array's
item template, into one branch of a choice — and a string would have to encode
which, badly.

**A write to a path that no longer fits returns the tree unchanged.** A render and
a click are separated by time, so a row can be removed by one action while another
is mid-flight. Losing that edit is a far better outcome than throwing away the
document.

---

## The escape hatch, and where it is lossy

A "code view" beside a visual editor is right — a builder must not trap a power
user. But a tree containing generated values has no literal spelling, because
there is no JSON that means "a different name on every call".

So:

- `isAllStatic` decides whether the JSON tab is an **editor** or a **viewer**.
- `toJson` returns `null` rather than inventing something for the dynamic case.
- The UI says which one it is.

Most tools in this shape are quietly lossy exactly here.

**`fromJson` has to produce real nodes, not one opaque blob.** Pasting JSON that
comes back as a single unopenable value is what makes most code views one-way.

---

## Injected, not imported, when a dependency is large and server-only

`@faker-js/faker` is ~3 MB and `domain/` is reachable from the client bundle, so
the registry holds ids and metadata while the call itself arrives on
`ExecutionContext` from a `server-only` module — the same seam `clock` and
`random` already use.

**Ids are a literal union and carry no dots**, because each becomes a `next-intl`
message key and a dot is that library's namespace separator.

**Verify a registry against the library it names.** Fifty-one hand-written
`"person.fullName"` strings are fifty-one chances to be wrong, and a typo degrades
to `null` at runtime rather than failing a build. A throwaway script that imports
the real package and calls every entry is a minute's work — the same "check
against something that is not you" rule as
[`../testing.md`](../testing.md#verifying-against-something-that-is-not-you).

---

## Seed the generator; never reach for `Math.random`

`Math.random` is unseedable in every engine, which makes reproducibility
impossible — and reproducibility is what turns a mock into a test fixture.
`sfc32` behind an avalanche hash of a string seed is fifteen lines.

Keep it away from anything that must be unguessable: credentials still come from
`crypto.getRandomValues`.

---

## Related

- [`input-suggestions.md`](input-suggestions.md) — the free-text boxes inside
  these rows.
- [`../case-studies/mock-server.md`](../case-studies/mock-server.md) and
  [`../mock-server-studio.md`](../mock-server-studio.md).
