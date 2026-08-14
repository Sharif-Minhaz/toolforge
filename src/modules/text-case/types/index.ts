/**
 * The seven cases that keep the text as prose.
 *
 * Every one of them rewrites letters where they already stand: punctuation,
 * spacing and line structure survive untouched, so a paragraph that goes in
 * comes back as the same paragraph in a different voice.
 */
export const PROSE_CASES = [
    "sentence",
    "lower",
    "upper",
    "capitalized",
    "title",
    "alternating",
    "inverse",
] as const;

export type ProseCase = (typeof PROSE_CASES)[number];

/**
 * The seven that build an identifier instead.
 *
 * These do not rewrite the text — they take it apart into words and put a new
 * string together, so every space, comma and full stop is gone by construction.
 * That is the whole difference between the two families, and it is why
 * `empty_result` is reachable from this half and not from the other.
 */
export const IDENTIFIER_CASES = [
    "camel",
    "pascal",
    "snake",
    "kebab",
    "constant",
    "dot",
    "path",
] as const;

export type IdentifierCase = (typeof IDENTIFIER_CASES)[number];

/** Every case the tool offers, in the order the picker lists them. */
export const TEXT_CASES = [...PROSE_CASES, ...IDENTIFIER_CASES] as const;

export type TextCase = (typeof TEXT_CASES)[number];

export type TextCaseOptions = {
    readonly textCase: TextCase;
    /**
     * Converts each line on its own rather than the passage as one unit. It is
     * the unit of work, not a formatting switch: a sentence ends at a line
     * break, a title's last word is the last word of its line, and an
     * identifier is built per line instead of running the whole paste together.
     */
    readonly perLine: boolean;
    /**
     * Leaves a run of two or more capitals — `API`, `HTTP`, `JSON` — exactly as
     * it was typed. Only the five cases that decide a word's capitalisation
     * word by word can honour it; see `supportsAcronyms`.
     */
    readonly preserveAcronyms: boolean;
};

export type TextCaseFailureReason =
    | "too_long"
    /** An identifier case was asked to build a name from text holding no words. */
    | "empty_result";

export type TextCaseFailure = {
    readonly ok: false;
    readonly reason: TextCaseFailureReason;
};

/** What the counter under a box reports, for the input and the output alike. */
export type TextStats = {
    /** Code points, so an emoji or a Bangla conjunct counts once. */
    readonly characters: number;
    readonly words: number;
    readonly lines: number;
};

export type TextCaseSuccess = {
    readonly ok: true;
    readonly text: string;
    readonly stats: TextStats;
    /** True when the text was already in the requested case. */
    readonly unchanged: boolean;
};

export type TextCaseResult = TextCaseSuccess | TextCaseFailure;

export type TextCaseExportRequest = {
    readonly content: string;
    /** Names the case in the filename, so two downloads are told apart. */
    readonly textCase: TextCase;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
