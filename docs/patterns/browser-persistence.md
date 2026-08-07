# Remembering Something in the Reader's Browser

`short-links/domain/history.ts` and `short-links/components/use-link-history.ts`
are the pattern for anything a tool has to remember between visits.

---

## Three parts, each solving a failure the obvious version has

- **Storage is a parameter with a browser default**, exactly like
  `tools/domain/clipboard.ts`. That is what makes a full quota, a blocked
  profile, and a hand-edited value reachable from a test with no DOM. Reading
  `window.localStorage` can itself throw, so even the lookup is in a `try`.
- **Every read is defensive and total.** Absent, unparseable, an object where an
  array belongs, one bad row among good ones — each degrades to what can still be
  read. A convenience list is never worth throwing a page away for, so the parser
  **filters rather than validates**.
- **The React binding is `useSyncExternalStore`, not state seeded from an
  effect.** It has a separate server snapshot, so the server render and the
  hydration pass both see an empty list and hydration cannot mismatch; and it can
  subscribe to `storage`, so a second tab stays in step. The snapshot is cached at
  module scope because `getSnapshot` must return a stable reference — re-parsing
  on every call hands React a new array each time and spins forever.

---

## One list per tool

One list per tool, under its own key, because a poster and a campaign link are
two different things to the person who made them even though they are one row in
the database. `historyStorageKey(tool)` is the only place that mapping lives.

---

## When what you are storing is a credential

Both short-link tools keep each link's edit URL, because a one-time link nobody
saved is a feature nobody can use. If a tool does that:

1. Say so in the UI.
2. Cap the list.
3. Give it a button that empties it.

Do it quietly and the tool is a credential store that never admitted to being
one.

It also obliges the surrounding copy to stop overstating the stakes: once the
browser keeps a copy, "shown once, save it now or lose it forever" is no longer
true, and **copy that overstates teaches readers to skip the copy that does
not.**

---

## Related

- [`../hydration-and-platform-pitfalls.md`](../hydration-and-platform-pitfalls.md)
  — why the effect-seeded version is a hydration bug, not just a style choice.
- [`../security.md`](../security.md) — the credential rule as a security rule.
