import type { SlugOptions, SlugSeparatorPreset } from "../types";

export const SEPARATOR_CHARACTERS: Record<SlugSeparatorPreset, string> = {
    dash: "-",
    underscore: "_",
    dot: ".",
    tilde: "~",
};

/**
 * RFC 3986 §2.3 lists exactly four unreserved punctuation marks. Anything else
 * a reader might type — a space, `&`, `/`, `%` — has to be percent-encoded to
 * survive a URL, which is the opposite of what a slug is for, so the tool
 * refuses it by name instead of silently rewriting it.
 */
export const SAFE_SEPARATOR_CHARACTERS = "-._~";

/** Long enough for `--` or `_-_`, short enough that it stays a separator. */
export const MAX_SEPARATOR_LENGTH = 3;

/**
 * Ceiling on one run. Everything happens on the main thread, and twenty
 * thousand characters is already a long article's worth of headings.
 */
export const MAX_SLUG_INPUT_LENGTH = 20_000;

/** Upper bound on the `maxLength` option itself; `0` disables truncation. */
export const MAX_SLUG_LENGTH = 200;

export const SLUG_LENGTH_PRESETS = [0, 40, 60, 80] as const;

/** Longest `?text=` value accepted from a shared link. */
export const MAX_SHARED_TEXT_LENGTH = 2048;

export const DEFAULT_SLUG_OPTIONS: SlugOptions = {
    separator: "dash",
    customSeparator: "",
    lowercase: true,
    ascii: true,
    stripStopWords: false,
    stripNumbers: false,
    maxLength: 0,
    perLine: false,
};
