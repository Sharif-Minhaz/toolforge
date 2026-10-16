/**
 * Every threshold the diagnosis uses. Each is a judgement about people and
 * switches, so each says what it assumes.
 */

/**
 * Press to press, the default line between a fast human and a bouncing switch.
 * Fifty milliseconds is twenty clicks a second from one finger, which nobody
 * sustains; it is also the figure the vendor testers use, so a reading here
 * means the same as a reading there.
 */
export const DEFAULT_FAULT_WINDOW_MS = 50;

export const MIN_FAULT_WINDOW_MS = 20;

export const MAX_FAULT_WINDOW_MS = 120;

export const FAULT_WINDOW_STEP_MS = 5;

/**
 * A release-to-press gap this short is mechanical whatever the press-to-press
 * time. It catches the commonest failure the window misses: an ordinary click,
 * held for a tenth of a second, that bounces on the way back up.
 */
export const BOUNCE_GAP_MS = 12;

/**
 * A press held at least this long, then broken for less than the fault window,
 * is a drop rather than chatter: somebody was holding the button, not clicking
 * it.
 */
export const HOLD_DROP_MIN_MS = 200;

/** How long a hold has to last, unbroken, for the hold test to pass. */
export const HOLD_TEST_MS = 3000;

/**
 * A press held at least this long counts as an attempt at the hold test: it is
 * logged when it ends, and it replaces the hold bar's last reading. Anything
 * shorter is a click, and a click mid-test must not wipe out the last attempt.
 */
export const HOLD_ATTEMPT_MIN_MS = 400;

/**
 * Two notches either side of a wrong-way one must both fall inside this for it
 * to count as a reversal. A person changing direction on purpose takes far
 * longer than this between notches; a worn encoder does it mid-flick.
 */
export const REVERSAL_WINDOW_MS = 150;

/** Presses a button needs, fault-free, before it is called healthy. */
export const MIN_PRESSES_FOR_VERDICT = 20;

/** Wheel notches, up and down together, before the wheel is called healthy. */
export const MIN_WHEEL_NOTCHES_FOR_VERDICT = 30;

/** At or past either of these a suspect control is called faulty. */
export const FAULTY_MIN_FAULTS = 3;

export const FAULTY_FAULT_RATE = 0.05;

/** The newest entries the event log keeps. */
export const MAX_LOG_ENTRIES = 200;

/** The faults the report keeps, oldest first. Past this the session is not in doubt. */
export const MAX_FAULT_RECORDS = 500;

/** Pointer samples the polling estimate is taken over — half a second at 1000 Hz. */
export const POLLING_SAMPLE_WINDOW = 512;

/** Intervals needed before a rate is reported at all. */
export const MIN_POLLING_INTERVALS = 64;

/**
 * Longer than this between two samples and the mouse had stopped. Twenty-five
 * hertz is below any mouse sold, so nothing real is excluded.
 */
export const POLLING_MOVE_GAP_MS = 40;

/** The rates mice are sold at. */
export const STANDARD_POLLING_RATES = [125, 250, 500, 1000, 2000, 4000, 8000] as const;

/**
 * How far, in octaves, a measured rate may sit from a standard one and still be
 * called it. A third of an octave is about 26 % either way.
 */
export const POLLING_CLASS_TOLERANCE_OCTAVES = 1 / 3;

/**
 * After a touch or pen pointer event, mouse events this soon after it are the
 * browser's compatibility copies of the tap, not a mouse. Long enough to cover
 * a long press; short enough that a real mouse picked up afterwards is heard.
 */
export const TOUCH_COMPAT_WINDOW_MS = 800;
