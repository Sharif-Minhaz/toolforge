/**
 * Separator presets offered as one-tap choices. `custom` hands the field over
 * to the reader, who may type any of the RFC 3986 unreserved marks — see
 * `SAFE_SEPARATOR_CHARACTERS`.
 */
export const SLUG_SEPARATORS = ["dash", "underscore", "dot", "tilde", "custom"] as const;

export type SlugSeparator = (typeof SLUG_SEPARATORS)[number];

/** Every preset that resolves to a fixed character, i.e. all but `custom`. */
export type SlugSeparatorPreset = Exclude<SlugSeparator, "custom">;

export type SlugOptions = {
    readonly separator: SlugSeparator;
    /** Used only when `separator` is `custom`; empty means "join with nothing". */
    readonly customSeparator: string;
    readonly lowercase: boolean;
    /** Folds accents to plain letters and drops whatever has no ASCII form. */
    readonly ascii: boolean;
    readonly stripStopWords: boolean;
    readonly stripNumbers: boolean;
    /** Ceiling on the slug in characters; `0` means no ceiling. */
    readonly maxLength: number;
    /** Slugifies each input line on its own instead of as one heading. */
    readonly perLine: boolean;
};

export type SlugFailureReason =
    /** The typed separator holds a character a URL would have to escape. */
    | "unsafe_separator"
    | "separator_too_long"
    /** Something was typed, but no slug character survived the options. */
    | "empty_result"
    | "too_long";

export type SlugFailure = {
    readonly ok: false;
    readonly reason: SlugFailureReason;
    /** The offending character, set only for `unsafe_separator`. */
    readonly character?: string;
};

export type SlugSuccess = {
    readonly ok: true;
    /** The finished slug — one line, or one per input line in `perLine` mode. */
    readonly slug: string;
    /** Characters in the output, counted as code points rather than units. */
    readonly length: number;
    /** Words kept across every line, after filtering and truncation. */
    readonly words: number;
    /** True when `maxLength` actually cut something off. */
    readonly truncated: boolean;
};

export type SlugResult = SlugSuccess | SlugFailure;

export type SeparatorResult = { readonly ok: true; readonly value: string } | SlugFailure;

export type SlugExportRequest = {
    readonly content: string;
    /** Injected so exported filenames are deterministic in tests. */
    readonly generatedAt: Date;
};
