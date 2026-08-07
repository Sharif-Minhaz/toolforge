# Telling Somebody How Full the Box Is

`tools/domain/input-limit.ts` and `tools/components/input-limit-meter.tsx` are
the one implementation. Every free-text field on the site reads them.

---

## Why it exists

Every tool on this site already refused oversized input — a ceiling in `domain/`
and a `z.string().max()` on every Server Action. What none of them did was say so
_before_ the refusal, and a box that accepts a paste and then reports a failure is
indistinguishable from a broken tool.

---

## Three states, not two

A field that only speaks when it is full teaches nobody anything, and one that
shows `0 / 60` from the first keystroke is noise on fifty-nine of them.

`readInputLimit` returns `ok`, `near` or `over`, and the meter renders nothing in
the first unless the caller asks for a running count.

The window is a ratio clamped at both ends — 10% of a 20-character alias is two
characters, which is too late, and 10% of a 250,000-character document is 25,000,
which is not "nearly" anything.

## It takes a length, not a string

Some ceilings are UTF-16 units and some are UTF-8 bytes, and one function over a
number serves both. Byte-measured fields pass `useByteLabel()` as `format`, which
also switches the copy off its plural forms — "1 character left" has no byte
equivalent.

---

## Cap or warn

Both are correct and using the wrong one is the bug.

```
What is this field?

A short identity field — a name, an alias, a hostname, a key, a colour,
a header?
└─ Cap it with maxLength.
   Typed or pasted whole; one over the ceiling is a mistake, so the browser
   refusing the keystroke costs nothing. Such a field can never read `over`;
   the meter only counts down.

A content box — a db.json, a curl command, a JWT, a Markdown draft,
an OpenAPI document?
└─ NEVER cap it.
   maxLength truncates a paste silently, and a document cut mid-string is not
   a shorter document — it is an invalid one, or worse a valid one that means
   something else.
   Instead: show the meter, render the failure under the box, and disable
   whatever submits it.
```

A box that says "too large" above a button that will happily post it is the same
defect in a new place.

---

## Where each part goes

**The counter goes beside the label, the failure goes under the box.** "How much
is left" is a property of the field; "this cannot be submitted" is a verdict, and
every verdict on this site appears in a `StatusStrip` under its control.
`useInputLimitStatus` shapes one for that strip.

**A live region that speaks on every keystroke is unusable.** The meter carries
`role="status"` only once the state stops being `ok`.

---

## Bounding what Zod passes through

`serverActions.bodySizeLimit` is 11 MB app-wide because one tool forwards
photographs, so every action inherits that ceiling — and the mock studio's `graph`
and `body` were `z.unknown()`, which is the right call about _shape_ and was
silently also a decision about _size_.

`tools/domain/payload-size.ts` is the guard, and its two properties are the
design:

- **It walks iteratively**, because a ten-thousand-deep array is a payload
  somebody can post and a recursive walk over one is a stack overflow rather than
  a refusal.
- **It costs the budget, not the payload** — an array is charged for its `length`
  before a single item is pushed, so refusing a half-million-element paste is
  bounded work.

`JSON.stringify(value).length > limit` is the obvious version and it serialises
the whole thing first, which is the cost being defended against.

---

## Related

- A ceiling on something a stranger can *grow* over time needs a second number
  and a way back down: [`growth-ceilings.md`](growth-ceilings.md).
- Highlighting has its own ceiling for a different reason:
  [`syntax-highlighting.md`](syntax-highlighting.md).
