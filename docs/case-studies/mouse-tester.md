# Mouse Tester

`src/modules/mouse-tester/` — reading a physical mouse through a browser that
would rather act on it than report it.

Everything below is cheap to reintroduce. Read it before touching the capture
hook or the session reducer.

---

## A React `onWheel` cannot stop the page scrolling

React attaches `wheel` as a passive listener, and `preventDefault()` in a
passive listener is ignored with a console warning. A wheel test whose page
scrolls away under the pointer is not a test. Every listener in
`components/use-mouse-capture.ts` is native for that reason, added in one effect
with `{ passive: false }` on the wheel.

## Back and Forward fire on the release, and the release can be anywhere

Browsers navigate on buttons 4 and 5 when they are _let go_, so cancelling
`mousedown` does nothing; it is `mouseup` (and `auxclick`) that has to be
cancelled. A press that starts in the area and ends outside it would still
navigate if only the area listened, so the release is heard on `window`, in the
capture phase, and cancelled whenever the press began inside — tracked in a
local set, not read from React state, which a native listener would see stale.

The same window listener is what keeps a button from staying held forever when
it is released outside the area. A `blur` with buttons down sends `cancel`,
which clears them **and their last release**, so returning to the window and
pressing at once cannot be measured as a 2 ms bounce.

## Counting `pointermove` events measures the display

A browser delivers one `pointermove` per frame. A tester that counts them reports
60, 120 or 144 Hz for any mouse, which is why so many do. The reports in between
are in `getCoalescedEvents()`, each with its own `timeStamp`, and the polling
estimate is taken over those. The median interval decides the rate, because a
hand turning round or a late OS batch moves a mean a long way. Without coalesced
events the hook falls back to the event itself, and the reading is the refresh
rate — the article and the FAQ say so.

## Chatter and a drop are the same events in a different order of magnitude

Both are a release followed almost at once by a press. Only the hold before
them separates the two: a hold of `HOLD_DROP_MIN_MS` or more, broken for less
than the fault window, is a drop; anything else under the window press to press
is chatter. A third rule catches what the window misses — an ordinary 120 ms
click that bounces on the way up has a long press-to-press time but a release
gap of a few milliseconds, and `BOUNCE_GAP_MS` flags that whatever the window.
`classifyPress` checks in that order; reordering it turns every drop into
chatter.

## A reversal can only be judged one notch late

A wrong-way wheel notch is only wrong once the notch after it agrees with the
one before. The reducer keeps the last two notches per axis and judges the
_middle_ one when the third arrives, then marks its log entry by id. Axes are
kept apart: a tilt between two downward notches is not a reversal.

## "left" is a button and a direction

`MouseButton` and `WheelDirection` both contain `"left"` and `"right"`, so a log
entry's control alone cannot say which it is. `LogEntry` is a union on `kind`,
and every switch over it narrows on `kind` first. A flat type with
`control: MouseButton | WheelDirection` type-checks and renders "Left press"
for a tilt.

## A DPI button cannot be heard, only measured

The button changes the sensor's setting inside the mouse and sends the
computer nothing, so the DPI test measures its effect: a ruler swipe with the
pointer locked, counts over inches. Three things in `components/dpi-panel.tsx`
are deliberate:

- **Displacement, not path.** `Math.hypot` of the summed `movementX` and
  `movementY`. A hand that wobbles along a ruler adds path but no displacement.
- **Raw counts are credited only to Chromium.** `requestPointerLock({
unadjustedMovement: true })` rejects where the option is unsupported, and the
  panel retries without it — but Firefox returns nothing instead of a promise,
  and a browser that resolves while ignoring the option would otherwise be
  reported as raw. The panel claims raw only when the promise resolved _and_
  `navigator.userAgentData` exists.
- **The pad is not the capture area.** The lock target is a separate element,
  so the clicks that start and end a swipe never count as presses.

A stage within `DPI_SAME_STAGE_TOLERANCE` of the one before is reported as a
button that did nothing. The reader says when they pressed it (Next DPI stage);
inferring stage changes from the readings would turn a dead button into "one
stage, four swipes".

## A tap arrives as a left click

Touch screens fire compatibility `mousedown`/`mouseup` after every tap, with
`button` 0. Any touch or pen pointer event opens a `TOUCH_COMPAT_WINDOW_MS`
window in which mouse events are ignored, and `pointerenter` only counts a
mouse. The "no mouse" notice reads `(any-pointer: fine)` through
`useSyncExternalStore`, with a server snapshot of `true` — a desktop must never
flash the notice on hydration — and also clears the moment a mouse pointer
event is seen, because hybrid devices report the query wrongly.
