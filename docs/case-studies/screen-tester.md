# Dead Pixel & Screen Tester

`src/modules/screen-tester/` — one colour over the whole screen at a time, in a
browser that would rather keep its own bars on it.

Read it before touching the start handler or the test screen.

---

## Nothing on this page flashes, and nothing advances by itself

Stuck-pixel "fixers" cycle colours many times a second. Flashing faster than
three times a second is the WCAG 2.3.1 seizure threshold, and the evidence that
the fixers work is thin, so the tool does not have one and the FAQ says why. A
pattern changes only on a key, a click or a tap. Do not add a slideshow timer,
an auto-advance or a transition that strobes between patterns — the fade on the
guide is opacity on the chrome, never on the pattern.

## Full screen is asked for on the document, inside the click

Browsers grant full screen only to a user gesture, and the dialog's own element
does not exist until React has committed the state the click just set. So
`start()` calls `document.documentElement.requestFullscreen()` synchronously
and the dialog is a fixed layer over the page. Moving the request onto the
dialog element means waiting for the commit, which leans on transient
activation lasting long enough — it does in Chrome, and is the thing that
breaks first elsewhere. Leaving full screen the browser's way (Esc, a system
gesture) arrives as `fullscreenchange`, which ends the run.

## Three named ways to cover the screen

`ScreenDisplay` is `fullscreen`, `unsupported` or `refused`. iPhone Safari has
no Fullscreen API for pages at all (`document.fullscreenEnabled` is not
`true`), and the notice above the controls says so before the reader starts; a
rejected request falls back to the window and says that instead. Both
fallbacks fill the window with the same dialog. The support check reads
through `useSyncExternalStore` with a server snapshot of `true`, so a desktop
never flashes the notice on hydration.

## The checkerboard is drawn on device pixels

A CSS checker is laid out in CSS pixels; at any scale other than 1 it is
resampled and reads as flat grey or moiré, which looks exactly like the fault
it is meant to reveal. The canvas backing store is sized from
`device-pixel-content-box` and filled from a 2×2 tile with no transform. Safari
does not support that box (the `observe` call throws, and is caught), so it
falls back to the CSS box times `devicePixelRatio`, rounded — exact at integer
scales, possibly a pixel off at fractional ones.

## Focus starts on the surface, not on a button

Space and Enter step forward. A focused button answers them itself, so the key
handler steps only when the target is not a button — otherwise one press moves
two screens. Initial focus goes to the surface for the same reason: on the
first button, Space would press it; on Exit, Space would end the test.
