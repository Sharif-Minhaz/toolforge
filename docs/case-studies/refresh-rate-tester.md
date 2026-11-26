# Refresh Rate Tester
`src/modules/refresh-rate-tester/` — reading a screen's refresh rate through the
one clock a page gets: the timestamp on each `requestAnimationFrame`.

Read it before touching `domain/frames.ts` or the frame hook.

---

## 1000 ÷ the median is wrong on a rounded clock
Browsers that coarsen their clocks against timing attacks hand out frame times
rounded to the millisecond. A 144 Hz screen's 6.94 ms intervals then arrive as
mostly 7 and sometimes 6, the median is 7, and the obvious reading says
142.9 Hz. `summarizeFrames` uses the median only to find the period: each
interval is rounded to the number of refreshes it spans, and the reading is
refreshes over the time they took. The rounding errors cancel across the
window, and the test feeds a millisecond-rounded 144 Hz stream to pin it.

## A dropped frame is two refreshes, not a slow one
Counting a 13.9 ms gap as one frame drags a mean down and adds a spike to the
jitter. Because each interval is counted in refreshes, a drop leaves the rate
alone and shows up once, in the dropped count. Jitter is taken over on-time
intervals only, for the same reason — a drop is never reported twice.

## A hidden tab is a restart, not a pause
A hidden tab gets no frames, or throttled ones, and the first gap after it
returns is the whole absence. The hook stops on `visibilitychange` and starts a
fresh recorder — warm-up included — when the tab is visible again. The warm-up
(`WARMUP_FRAMES`) exists because the first callbacks after a start arrive while
the page is still laying out.

## The window is time, not a frame count
The reading covers the last `MEASUREMENT_WINDOW_MS`, so dragging the window to
another screen shows within seconds and "dropped in the last five seconds"
means the same thing at 60 Hz and 360 Hz. `MAX_WINDOW_FRAMES` bounds the
buffer whatever the clock does.

## Nothing per frame goes through React
The recorder is mutated in a ref and the reading is published every
`READING_REFRESH_MS`; the motion block's transform is written directly. A
state update per frame would re-render the workbench at the rate it is
measuring, and the work would show up as the dropped frames it reports.
