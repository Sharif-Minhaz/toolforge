import type { ImageFileLimits } from "@/modules/tools/domain/image-file";

/**
 * Ceiling on one conversion. An equation is a line, not a document — and the
 * shared highlighter stops colouring at 20,000 characters, so a source box that
 * accepted more would silently lose its own syntax colours.
 */
export const MAX_EQUATION_INPUT_LENGTH = 5_000;

/** Ceiling on the LaTeX box, which the reader edits by hand after conversion. */
export const MAX_LATEX_LENGTH = 5_000;

/**
 * How many lines one conversion may produce.
 *
 * The limit is the tab strip rather than the arithmetic: twenty numbered tabs
 * already wrap to three rows at 390 px, and past that a reader cannot find the
 * equation they were looking at. Refusing is better than rendering a strip
 * nobody can use.
 */
export const MAX_EQUATIONS = 20;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_SHARED_TEXT_LENGTH = 2048;

/**
 * What the input box starts with when nothing was shared.
 *
 * Three lines, one per shape the converter is built around — an implied power,
 * a big operator with limits, and a fraction whose numerator is a whole term —
 * so the first press shows what the tool actually does rather than a single
 * `x^2`. Data, not copy: it is maths, and it reads the same in either locale.
 */
export const SAMPLE_INPUT = [
    "x2 + y2 = r2",
    "sum i=1 to n of i^2 = n(n+1)(2n+1)/6",
    "integral from 0 to infinity of e^(-x^2) dx = sqrt(pi)/2",
].join("\n");

/** Whether the preview and the Markdown wrapper use display mode by default. */
export const DEFAULT_DISPLAY_MODE = true;

/* ---------------------------------------------------- image recognition --- */

/**
 * The recognizer's own allow-list.
 *
 * Narrower than what the shared decoder can read, and deliberately so: the
 * worker hands the bytes to a vision model, and these three are the formats
 * such a model is reliably trained on. A GIF or a BMP would be accepted by the
 * browser and then answered badly, which is worse than being turned away.
 */
export const ALLOWED_EQUATION_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type AllowedEquationImageType = (typeof ALLOWED_EQUATION_IMAGE_TYPES)[number];

/** `accept` for the file input — a hint to the picker, never a substitute for the check. */
export const EQUATION_IMAGE_ACCEPT = ALLOWED_EQUATION_IMAGE_TYPES.join(",");

/**
 * Both ceilings are the recognizer's, mirrored here so a hopeless upload is
 * refused in the tab rather than after a round trip — the model budget upstream
 * is finite and shared by everyone on this deployment.
 */
export const MAX_EQUATION_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * The recognizer refuses anything under a kilobyte outright. It is a real
 * check rather than a formality: a 200-byte "image" is a truncated download or
 * a tracking pixel, and neither has an equation in it.
 */
export const MIN_EQUATION_IMAGE_BYTES = 1024;

/**
 * A vision model has to base64 the upload before it can look at it, and then
 * transcribe every symbol it finds. Past this the reader deserves to hear that
 * it stalled rather than watch a spinner.
 */
export const RECOGNITION_TIMEOUT_MS = 45_000;

/** Sent to Turnstile so its dashboard separates this widget from any other. */
export const TURNSTILE_ACTION = "equation-recognize";

/** Field names the worker reads its multipart body from. */
export const IMAGE_FORM_FIELD = "image";

export const TOKEN_FORM_FIELD = "token";

/**
 * How many equations one picture may contribute.
 *
 * The same ceiling the text path uses, for the same reason — the tab strip is
 * what has to stay usable — but enforced against the *model's* output, which is
 * the one number here nobody on this side controls.
 */
export const MAX_RECOGNIZED_EQUATIONS = MAX_EQUATIONS;

/** Longest LaTeX string accepted from the recognizer, per equation. */
export const MAX_RECOGNIZED_LATEX_LENGTH = MAX_LATEX_LENGTH;

/**
 * The pair the shared file check reads, exported as one value so the island and
 * the server action can never drift into gating uploads differently.
 *
 * The floor is not in here because `checkImageFile` has no concept of one — it
 * answers "empty, wrong type, or too big". `checkEquationImage` below adds the
 * fourth answer rather than folding it into `empty_file`, which would tell a
 * reader with a 200-byte PNG that their file was empty when it was not.
 */
export const EQUATION_IMAGE_LIMITS: ImageFileLimits<AllowedEquationImageType> = {
    allowedTypes: ALLOWED_EQUATION_IMAGE_TYPES,
    maxBytes: MAX_EQUATION_IMAGE_BYTES,
};
