# Hex Editor

A file editor that holds half a gigabyte in a browser tab, paints sixteen bytes
a row at sixty frames a second, and lets you overwrite any of them.

Almost everything expensive here is a consequence of one decision: the bytes are
held whole, in one `Uint8Array`, so that reading a byte is a single array index.
The grid asks for one on every cell of every row it paints — anything with a
search or a tree walk in it turns scrolling into a profile.

Everything below cost time to find. Read it before changing the grid, the store,
or anything that renders a byte.

---

## The scroll spacer has a ceiling, and it is lower than the files this opens

A virtualised list works by making a spacer as tall as the content would be and
positioning the visible rows inside it. Browsers silently clamp an element past
roughly **33.5 million pixels**. At 22 pixels a row, that ceiling is passed by
any file over about **24 MB** — which is well inside what a hex editor is for.

A clamped spacer does not fail loudly. The scrollbar reaches the bottom while the
grid is a twentieth of the way into the file, and the remaining rows are simply
unreachable.

So `domain/window.ts` owns the mapping from scroll position to row, in two
regimes:

- **Under the ceiling**, `startRow` is a division and the block is positioned at
  `startRow * rowHeight`. Exact, pixel for row.
- **Over it**, the spacer stops at `MAX_SPACER_HEIGHT` and the scroll position is
  mapped onto the row range **by ratio**. The rendered block is then pinned to
  the scroll position rather than to a row boundary, because its rows no longer
  correspond to a pixel offset in the spacer.

`RowWindow.scaled` says which regime is in force. One notch of the wheel is worth
more than one row in the scaled one, which is a real cost and the reason Go To,
the keyboard and the status bar all exist to land on an exact byte.

**This is why there is no virtualisation library here.** Owning the clamp means
owning the scroll-to-row mapping, which is precisely what a virtualiser owns.
Every row is also exactly `ROW_HEIGHT` tall — no measurement, no cache, no
resize observer — which is the case a general virtualiser spends most of its code
not being able to assume. The arithmetic is forty lines and
`tests/window.test.ts` covers both regimes, including "reaches the last row at
the bottom of the scrollbar", which is the bug above written down.

---

## The document is mutable, so `revision` is what a memo compares

`HexDocument` cannot be a value. Copying half a gigabyte per keystroke is not an
editor, so overwritten bytes live in a `Map` beside the original array and
`getByte` consults it. The array is never written to at all — which is also what
makes "revert this byte" free, and what lets `dirty` mean _different from the
file on disk_ rather than _somebody pressed a key_.

The consequence is that **nothing can subscribe to the document**. `revision` is
the value that changes when a byte does, and it is bumped by every write. Any
component or memo that renders bytes reads it alongside them:

```tsx
<HexRow document={document} revision={revision} … />
```

```ts
const readings = useMemo(() => readInspector(…), [document, focus, endian, revision]);
```

Drop `revision` from either and the panel keeps painting the byte it painted
before the edit, with no error anywhere.

---

## Every memo prop is a primitive, on purpose

`HexRow` is memoised so that a row which is neither selected nor edited nor
searched does not re-render when the caret moves three rows away. That only works
if every prop compares by value:

- the selection arrives as **two row-relative indices**, not a `Selection`;
- search hits arrive as a **sixteen-bit mask**, not an array of offsets.

An array computed per row per frame is a new reference every time and defeats the
memo it was computed for. `rowMatchMask` in `domain/search.ts` produces the mask
and binary-searches into the match list first, so a thousand matches do not turn
into a thousand comparisons per row.

The cells are elements rather than components for the same arithmetic: thirty-two
cells a row across forty rows is 1,280 component instances to reconcile per
frame, against 1,280 host elements either way, for a boundary that buys nothing —
the cells have no state and the pointer handler lives on the grid.

---

## `indexOf("")` is `0`, and that types a byte

`hexDigitValue` looked up a character in `"0123456789ABCDEF"` and returned the
index unless it was `-1`. An empty string matches at index `0` on every string in
JavaScript, so an empty keystroke read as the digit zero and wrote a nibble.

The fix is a length check, and the lesson is that `indexOf` is not a membership
test. `tests/format.test.ts` pins it.

---

## Search runs on a press, not on a debounce

This repository debounces typed input at 300 ms
([decision tree 43](../../CLAUDE.md#43-debounce-this-input)). The search box here
deliberately does not, and the comment in `hex-store.ts` says so.

A scan is linear in the file. On a few hundred megabytes, a 300 ms debounce still
means a full scan every time the reader pauses — the debounce moves the cost, it
does not remove it. Pressing Find is a decision, and the answer is worth waiting
for once.

The other half of bounding the work is `MAX_SEARCH_MATCHES`: the scan stops at a
thousand and reports `truncated`, because ten million highlighted matches is not
a result anybody asked for.

---

## The answer a search gives here is the screen behind the dialog

Find shipped as a `Dialog`, which is the repository's habit and was wrong for
this tool. What a search produces here is not a value to read off a panel — it is
*highlighted bytes in the grid*, plus a caret that moved and a row that scrolled.
A centred dialog covers exactly that, so the reader pressed Next, saw nothing
change, and had to drag the dialog's own backdrop out of the way to find out
whether anything had.

`search-dock.tsx` is the same controls in a bar that takes a strip of the
editor's height and leaves the rest of the grid alone. The rule that falls out of
it is worth carrying to the next tool:

> A dialog is for a question. When the answer is a change in what is already on
> screen, the control belongs beside it, not over it.

Three details the bar needs that the dialog did not:

- **Enter finds, then steps.** Until something has been found Enter runs the
  scan; afterwards it moves to the next match and `Shift+Enter` to the previous,
  so walking a file is one held key rather than a reach for the mouse.
- **The position is read off the caret**, through `matchIndexAt`, rather than
  stored as an index. A click in the grid and a Go To both move the caret, and a
  stored index would go on claiming the reader was on match four.
- **Escape stops at the bar.** In full screen the same key closes the dialog the
  whole editor is sitting in, so the handler calls `stopPropagation` — one press
  shuts one thing.

---

## Full screen remounts the grid, so the caret has to be asked for again

Full screen moves the editor into a `Sheet`, which is a portal: the DOM under it
is rebuilt, so the grid mounts a fresh scroller at `scrollTop = 0` while the
store still says the caret is at 0x3F0000. Nothing is lost — the document, the
undo stack and the matches all live in the store — but the reader lands at the
top of the file.

`requestScroll(focus)` on the way in and on the way out is the fix: it asks the
grid to bring the caret's row back into view without touching the selection.

Which exposed the older bug underneath it. Every scroll request was nonced with
`revision + 1`, and `revision` counts *byte writes* — so two scroll requests with
no edit between them could carry the same nonce, and the grid's effect, keyed on
that nonce, would skip the second one. A fullscreen toggle followed by an arrow
key is exactly that pair. `scrollNonce` now counts scroll requests and nothing
else, and `scrollRequest()` is the only thing that writes either field, so the
two can never be set apart from one another.

---

## A module-level Zustand store must not be seeded during render

The store is a module singleton, which is what lets forty rows subscribe to the
handful of primitives they render without a provider re-rendering all of them on
every arrow key (the same reasoning as the Mock Server's
[`studio-store.ts`](../../src/modules/mock-server/components/studio-store.ts)).

The trap is initialising it from props. A `"use client"` component still renders
on the server, where one module object is shared by **every request in flight** —
two readers opening `?endian=big` and `?endian=little` would overwrite each
other's state. The seeding therefore happens in an effect, which never runs on the
server:

```tsx
useEffect(() => {
    useHexStore.setState({ endian: initialEndian, … });

    return () => useHexStore.getState().closeFile();
}, [initialEndian, initialColumn, initialSearchMode]);
```

Nothing is open on the first paint, so there is nothing to flash. The cleanup
matters too: without it, navigating away and back shows the previous file.

---

## Saving is two different things, and the page says which

Only browsers with the File System Access API can hand a page a writable handle,
and a file that arrived by drag and drop never comes with one. Where there is no
handle, Save is a download — an edited _copy_, in the downloads folder, under a
name the browser may have changed.

That is a limitation of the tool, so it is disclosed **above the grid**, not in
the article ([rule 32](../../CLAUDE.md#strong-conventions)). The capability is
probed inside the handler and behind `useIsHydrated`, never during render: a
capability probe on the client that the server cannot make is the definition of a
hydration mismatch.

`markSaved` rebases the document on what was written and **clears the undo
stack**, because the stack's `previous` values now describe a file that no longer
exists anywhere. An undo that silently re-dirties a document somebody just saved
is worse than no undo at all.

---

## Delete is one step, not four hundred

`EditHistory` holds _steps_ — `readonly ByteEdit[]` — rather than single bytes.
Typing a byte is a step of one; Delete over a selected range is a step of however
many bytes were selected. A stack of single bytes would need four hundred presses
of Ctrl+Z to undo one press of Delete, which is not an undo stack.

Two smaller rules fall out of the same file:

- **The keystroke that changes nothing is not recorded.** `setByte` returns
  `null` when the value is already there, `recordStep` ignores an empty step, and
  an undo that restores what is already on screen never happens.
- **Past the cap the oldest step goes, not the newest** — dropping the newest
  would make the most recent keystroke the one that cannot be taken back.

---

## Float16 is written out; Float32 and Float64 are not

`DataView` has accessors for single and double precision, so those are used.
`getFloat16` is recent enough that Bun, Node and the browsers this has to run in
do not agree on having it, and `getUint24` has never existed because three bytes
is not a machine word.

Both are a dozen lines of arithmetic, and a dozen lines that behave identically
everywhere beat a cached capability probe and a typed failure
([pitfall 1](../../.claude/skills/add-tool/references/pitfalls.md)). They are
checked against IEEE 754's published binary16 vectors rather than against a
second copy of the same function.

The UTF-8 reading is hand-written for a different reason: `TextDecoder` answers a
truncated or malformed sequence with U+FFFD, which reads as a real character
sitting in the file. `null` is the honest answer, and the row shows a dash. It is
still cross-checked against `TextDecoder` for the sequences both agree are valid.

---

## The GUID row is why the endianness selector is not decoration

The same sixteen bytes name two different GUIDs. Big-endian is RFC 4122's — the
bytes in the order they appear. Little-endian is Microsoft's mixed layout, where
the first three fields are byte-swapped and the last two are not:

```
00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF

big     → 00112233-4455-6677-8899-AABBCCDDEEFF
little  → 33221100-5544-7766-8899-AABBCCDDEEFF
```

Both are pinned in `tests/inspector.test.ts`. Getting this wrong produces a
plausible-looking GUID that names nothing.
