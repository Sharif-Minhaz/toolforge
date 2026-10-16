# Keyboard Tester

`src/modules/keyboard-tester/` — reading a keyboard through a browser that
uses half its keys for itself, in whatever layout the reader types in.

Read it before touching the capture hook, the reducer or the layout builder.

---

## Match by `code`, never by `key`

`KeyboardEvent.key` is the character the active layout produces; `code` is the
physical position. Matching on `key` is why other testers tell the reader to
switch to English first — and a Bangla or Russian layout produces characters no
drawing has. Everything here is keyed by `code`. Labels are a separate
concern: `navigator.keyboard.getLayoutMap()` (Chromium) relabels character keys
from the reader's layout, and `detectLayoutFamily` names it from four
positions. The map is read after hydration and again on window focus, because
that is when somebody who switched layouts comes back.

## Focus is the capture switch

The area captures every key — Tab, Space, F5, Alt — only while it has focus,
and holding Escape for `ESCAPE_RELEASE_MS` blurs it. Without that way out a
keyboard-only reader is trapped. Window-level capture was the alternative and
is wrong for the same reason. A blur sends `releaseAll`, so a key held while
focus left does not stay lit forever.

## Platform quirks that look like faults

- **Windows sends only `keyup` for Print Screen.** The reducer counts the first
  release of a never-pressed key as press and release at once. Only the first:
  after a `releaseAll`, a key still physically down sends its `keyup` later and
  must not count again.
- **macOS sends no `keyup` for keys pressed while Command is down.** On
  Command's own release the hook sends `releaseAll`, or every Cmd chord would
  leave keys stuck lit.
- **Auto-repeat arrives as `keydown` with `repeat: true`.** It is never a press
  and never chatter; it feeds the repeat reading, which describes the operating
  system's setting, not the keyboard.
- **On-screen keyboards report `Unidentified`** with no position. Those are
  counted apart so the page can say why nothing lights.

## Some keys never reach a page

Ctrl+W, Ctrl+T and the Windows key are taken by the browser or the system
before `keydown` fires, and `preventDefault` cannot help. "Capture system keys"
requests full screen and then `navigator.keyboard.lock()` — the lock only takes
effect in full screen, so the order matters. Escape belongs to the browser's
"hold to leave full screen" while locked, so the hook's own Escape-hold release
is disabled in that mode. The Keyboard API has no TypeScript types yet;
`components/keyboard-api.ts` is the narrow, all-optional declaration.

## A key that never arrives cannot be detected

Ghosting is the matrix refusing one key of a chord. No page can see a keydown
that never happened, so the combos panel shows each chord's keys lighting
live; the one left dark is the blocked one. Rollover is reported as the most
keys held at once with modifiers counted apart, because USB's boot protocol
stops at six non-modifier keys and "stuck at six" is the useful reading.

## Layouts are built, not listed

`domain/layouts.ts` builds every size from one alphanumeric block with a
different frame around it, and ISO from the same block with three keys moved.
The tests pin the key counts real boards have (104 ANSI full size, 105 ISO, 87
tenkeyless, 60 plus Fn on a 60%) and check that no two keys overlap — the ISO
Enter is one element clipped to its L shape, and is the one allowed overlap
with Backslash's notch.

## The lock lights can only be read off an event — and not trusted on their own key

There is no API to ask whether Caps, Num or Scroll Lock is on;
`KeyboardEvent.getModifierState()` answers only on an event, and it is wrong
about the lock whose own key fired it in a different way per platform. Linux
reports the state _before_ the event, so turning Caps Lock off reads "on" on
both the press and the release — the first version left the light on for
good. macOS sends one event per Caps Lock toggle: `keydown` to turn it on,
`keyup` to turn it off.

`domain/locks.ts` believes the lock key's own events only for the fact that it
was pressed — a press flips the light already known — and takes every other
key's report as the truth, which corrects any drift. Before the first key, the
click that focuses the board seeds all three — a `PointerEvent` carries
`getModifierState` too, and is not one of the lock keys' own events — and a
reader who Tabs in instead gets Linux's first press read as the opposite of its
report. On macOS a Caps Lock event
is also sent to the reducer as a whole press and release, or the key would look
held for as long as Caps Lock is on. macOS has no Num Lock and always reports
it off.
