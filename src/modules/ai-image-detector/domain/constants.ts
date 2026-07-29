import type { ImageFileLimits } from "@/modules/tools/domain/image-file";

/**
 * Ceiling enforced by the detector worker, mirrored here so the browser can
 * refuse a hopeless upload before spending a model call on it — the upstream
 * budget is finite and shared by everyone.
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * The worker's own allow-list. Anything outside it is rejected upstream with a
 * 415, so matching the set here turns a round trip into an instant answer.
 */
export const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** `accept` for the file input — a hint to the picker, never a substitute for the check. */
export const IMAGE_ACCEPT_ATTRIBUTE = ALLOWED_IMAGE_TYPES.join(",");

/**
 * The pair the shared file check reads, exported as one value so the island and
 * the server action can never drift into gating uploads differently.
 */
export const IMAGE_FILE_LIMITS: ImageFileLimits<AllowedImageType> = {
    allowedTypes: ALLOWED_IMAGE_TYPES,
    maxBytes: MAX_IMAGE_BYTES,
};

/** A long justification is a runaway generation, not a better explanation. */
export const MAX_IMAGE_REASONING_LENGTH = 600;

/**
 * A vision model has to base64 the upload before it can look at it, so this
 * sits well above the text detector's window. Past it, the reader deserves to
 * hear that it stalled rather than watch a spinner.
 */
export const IMAGE_DETECTION_TIMEOUT_MS = 30_000;

/** Sent to Turnstile so its dashboard separates this widget from any other. */
export const TURNSTILE_ACTION = "ai-image-detector";

/** Field name the worker reads the upload from. */
export const IMAGE_FORM_FIELD = "image";

export const TOKEN_FORM_FIELD = "token";

/** The only route the worker serves. */
export const DETECT_PATH = "detect";
