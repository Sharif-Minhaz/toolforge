/**
 * One reading of "how full is this box", shared by every input on the site.
 *
 * The tools already refuse oversized input — every domain layer has its own
 * ceiling and every Server Action bounds its payload with Zod. What was missing
 * is the half a reader can see: a box that accepts a paste and then reports a
 * failure is indistinguishable from a broken tool, and a box that silently
 * stops accepting keystrokes is worse.
 *
 * Two things this file deliberately does *not* do.
 *
 * **It takes a length, not a string.** Some ceilings are measured in UTF-16
 * units (`z.string().max()`, `maxLength`, `String.length`) and some in UTF-8
 * bytes (the JSON, Base64 and URL tools all cap the encoded size). One function
 * over a number serves both; one function over a string would have to guess,
 * and would guess wrong for exactly the inputs that matter.
 *
 * **It does not decide what to do about it.** A short identity field caps hard
 * at `maxLength` and can never be over; a large content box is never capped,
 * because truncating a paste destroys work the reader cannot get back. Which of
 * the two a field is belongs to the field, not here.
 */

/**
 * How close to the ceiling counts as "nearly full", as a share of the limit.
 *
 * A share alone is wrong at both ends — 10% of a 20-character alias is two
 * characters, which arrives far too late to be a warning, and 10% of a
 * 250,000-character document is 25,000, which is not "nearly" anything. The two
 * bounds below are what make one ratio serve a name field and a Markdown
 * editor.
 */
export const NEAR_LIMIT_RATIO = 0.1;

/** Never warn later than this many units from the ceiling. */
export const MIN_NEAR_WINDOW = 5;

/** Never warn earlier than this many units from the ceiling. */
export const MAX_NEAR_WINDOW = 500;

export type InputLimitState = "ok" | "near" | "over";

export type InputLimitReading = {
    readonly length: number;
    readonly limit: number;
    /** Units still available. Zero once the ceiling is reached or passed. */
    readonly remaining: number;
    /** Units past the ceiling. Zero while within it. */
    readonly over: number;
    readonly state: InputLimitState;
};

/**
 * The distance from the ceiling at which a field starts saying how much is
 * left. Clamped at both ends — see `NEAR_LIMIT_RATIO`.
 */
export function nearLimitWindow(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) {
        return 0;
    }

    return Math.min(
        MAX_NEAR_WINDOW,
        Math.max(MIN_NEAR_WINDOW, Math.ceil(limit * NEAR_LIMIT_RATIO)),
    );
}

/**
 * Read a measured length against a ceiling.
 *
 * `length` is whatever the field's own limit is counted in — characters for a
 * name, UTF-8 bytes for a document. Both are clamped to zero rather than
 * trusted, because a caller subtracting two counts can hand this a negative.
 */
export function readInputLimit(length: number, limit: number): InputLimitReading {
    const safeLength = Math.max(0, Math.floor(length));
    const safeLimit = Math.max(0, Math.floor(limit));

    const remaining = Math.max(0, safeLimit - safeLength);
    const over = Math.max(0, safeLength - safeLimit);

    if (over > 0) {
        return { length: safeLength, limit: safeLimit, remaining: 0, over, state: "over" };
    }

    const state: InputLimitState = remaining <= nearLimitWindow(safeLimit) ? "near" : "ok";

    return { length: safeLength, limit: safeLimit, remaining, over: 0, state };
}

/**
 * UTF-16 code units, which is what `maxLength`, `String.length` and Zod's
 * `.max()` all count. Astral characters therefore count two — deliberately, so
 * the number a reader sees is the number the server will check.
 */
export function measureCharacters(value: string): number {
    return value.length;
}

/**
 * Trim a value to a ceiling without splitting a surrogate pair.
 *
 * For the rare field that has to cap a value in code rather than through
 * `maxLength` — a paste handler, a value arriving from storage. Slicing at a
 * raw index can land between the halves of an emoji and produce a lone
 * surrogate, which is a character no font can draw and no encoder can round
 * trip.
 */
export function clampToLimit(value: string, limit: number): string {
    if (value.length <= limit) {
        return value;
    }

    const cut = Math.max(0, Math.floor(limit));
    const code = value.charCodeAt(cut - 1);
    const splitsPair = code >= 0xd800 && code <= 0xdbff;

    return value.slice(0, splitsPair ? cut - 1 : cut);
}
