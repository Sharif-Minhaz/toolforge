import type { MotionSpeed } from "../types";

/**
 * Frames thrown away after a start, a reset or a return to the tab. The first
 * callbacks arrive while the page is still laying out and the compositor is
 * spinning up, and their gaps say nothing about the display.
 */
export const WARMUP_FRAMES = 30;

/** The measurement covers the most recent stretch of frames, so moving the window to another screen shows. */
export const MEASUREMENT_WINDOW_MS = 5000;

/** Ceiling on the frames held, whatever the clock does: a 1000 Hz stream for the whole window. */
export const MAX_WINDOW_FRAMES = 5000;

/** Intervals needed before a reading is shown — one second at 60 Hz. */
export const MIN_INTERVALS = 60;

/** How often the reading on screen is recomputed. Per frame would redraw the page at the rate it measures. */
export const READING_REFRESH_MS = 250;

/** Rates panels and laptops actually ship at. 30 is a battery saver, not a panel. */
export const COMMON_REFRESH_RATES = [
    30, 48, 50, 60, 72, 75, 85, 90, 100, 120, 144, 165, 170, 175, 180, 200, 240, 280, 300, 360, 480,
    500, 540,
] as const;

/** How far a reading may sit from a common rate and still be named after it: 59.94 is 60, 110 is neither 100 nor 120. */
export const NEAREST_RATE_TOLERANCE = 0.03;

/** The rate browsers drop to under a battery saver or low-power mode. */
export const POWER_SAVER_RATE = 30;

export const MOTION_SPEED_PX_PER_SECOND: Record<MotionSpeed, number> = {
    slow: 240,
    medium: 480,
    fast: 960,
    fastest: 1920,
};

export const DEFAULT_MOTION_SPEED: MotionSpeed = "medium";
