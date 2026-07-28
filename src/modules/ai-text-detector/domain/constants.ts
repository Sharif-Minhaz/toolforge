/**
 * Length window enforced by the detector worker. Mirrored here so the browser
 * can refuse a hopeless request before spending a model call on it — the
 * upstream budget is finite and shared by everyone.
 */
export const MIN_DETECTION_TEXT_LENGTH = 50;

export const MAX_DETECTION_TEXT_LENGTH = 10_000;

/**
 * Outer bound on what the server action will even parse. Four times the real
 * ceiling: generous enough that an over-long paste still gets `too_long` rather
 * than a bare rejection, small enough to stay a bounded payload.
 */
export const MAX_SUBMITTED_TEXT_LENGTH = MAX_DETECTION_TEXT_LENGTH * 4;

/** Turnstile tokens are ~600 characters today; the cap only bounds abuse. */
export const MAX_TURNSTILE_TOKEN_LENGTH = 2_048;

/** A long justification is a runaway generation, not a better explanation. */
export const MAX_REASONING_LENGTH = 600;

/**
 * How many blocked terms the warning names before it stops listing them. A
 * status line that grows to twenty entries stops being readable, and the reader
 * only needs the next one to fix.
 */
export const MAX_REPORTED_BLOCKED_WORDS = 5;

/** Above this the copy says "high confidence"; below `MODERATE` it says "low". */
export const CONFIDENCE_BAND_THRESHOLDS = {
    moderate: 50,
    high: 80,
} as const;

/**
 * The worker runs an 8B model; a fast answer takes a second or two, and
 * anything past this is a stall the reader should hear about.
 */
export const DETECTION_REQUEST_TIMEOUT_MS = 20_000;

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const TURNSTILE_SCRIPT_URL =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Sent to Turnstile so its dashboard separates this widget from any other. */
export const TURNSTILE_ACTION = "ai-text-detector";
