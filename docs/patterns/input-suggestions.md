# Suggesting What Somebody Could Type

`mock-server/domain/suggest-path.ts` and `components/path-picker.tsx` are the
shape to copy whenever a free-text box has a knowable set of good answers.

The box in question asked for a path into a request — `avatar.contentType` — and
nothing on the page said what a request to that route contained, so the only way
to fill it in was to already know.

---

## A suggestion has to carry how sure it is

- A route's `:name` parameters are **exact and complete**.
- A body key seen in the last twenty-five requests is true of those requests and
  says nothing about the next one.
- A header from a list of ones people usually send is a **guess**.

Rendering all three identically is worse than offering none, because it teaches
readers to trust the guesses. Every entry carries an `origin` and every row is
labelled with it.

## Do not derive from traffic what you can derive from the definition

Path parameters come from `parsePathPattern`, variable names from the graph's own
`setVariable` nodes, and the three properties of an upload from this server's own
multipart parser. Each is exact, free, and available on a route nothing has ever
called — which is precisely when somebody is building it.

## Send the keys, not the rows

The observed half is reduced to paths **on the server**. The alternative ships
hundreds of request bodies to the browser to walk them there: megabytes instead of
hundreds of bytes, and a body the feature has no use for crossing the wire.
Whatever gate guards the source guards this too.

## Answer the empty case per reason

"Nothing matches what you typed", "this route has never been called" and "cookie
names are not recorded" lead somewhere completely different. One shared "no
suggestions" is the same dead end the plain text box was.

Where a fact is _structurally_ unavailable — the cookie header is redacted before
a log row is written — say so, rather than implying it will fill in later.

## It stays a text box

The list narrows beside the caret; it never constrains what may be typed, because
the commonest moment to need it is while building against a request that has not
been sent yet.

---

## Two mechanics that are easy to get wrong

- **Lay the list out in flow, not floated,** when the box lives in a scrolling
  pane. An `absolute` dropdown is clipped by the rail's `overflow-y-auto` the
  moment the row sits near the bottom, and a portal needs position tracking
  against a pane that pans, zooms and resizes. In flow it cannot be clipped or
  mispositioned. It does mean the component renders a **fragment** — the box and a
  `basis-full` sibling — so it only makes sense inside a `flex-wrap` row.
- **Swallow `Escape` while the list is open.** Base UI's dismiss hook listens for
  it on `document`, so an unswallowed press shuts the whole dialog instead of the
  list. `stopPropagation` on the synthetic event reaches it because React's root
  listener sits below `document` and the hook binds in the bubble phase — check
  that before relying on it, since a capture-phase listener could not be stopped
  this way.

## Do not debounce it

The repo's default for typed input is 300 ms and it is wrong here for the same
reason it is wrong in the URL Parser: this is a filter over a few hundred strings
already in memory, and a list lagging a third of a second behind the caret reads
as broken. **Match the debounce to the cost** —
[`../engineering-principles.md`](../engineering-principles.md#match-the-mechanism-to-the-cost).
