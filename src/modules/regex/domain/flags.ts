import { REGEX_FLAGS, type RegexFlag } from "../types";

/**
 * The letter each flag is written as. Six are real ECMAScript flags; `x` and
 * `U` are borrowed from PCRE and have no engine support at all — they are
 * applied by rewriting the pattern before it is compiled, which is why they
 * appear here but not in `ENGINE_LETTERS`.
 */
export const FLAG_LETTERS: Record<RegexFlag, string> = {
    global: "g",
    multiline: "m",
    ignoreCase: "i",
    dotAll: "s",
    extended: "x",
    unicode: "u",
    ungreedy: "U",
    sticky: "y",
};

const ENGINE_LETTERS: Partial<Record<RegexFlag, string>> = {
    global: "g",
    multiline: "m",
    ignoreCase: "i",
    dotAll: "s",
    unicode: "u",
    sticky: "y",
};

/**
 * Always compiled in. `d` populates `match.indices`, which is the only way to
 * report where each capture group landed; it changes nothing about matching.
 */
const INDICES_FLAG = "d";

export function hasFlag(flags: readonly RegexFlag[], flag: RegexFlag): boolean {
    return flags.includes(flag);
}

/** Toggling keeps the canonical display order rather than click order. */
export function toggleFlag(flags: readonly RegexFlag[], flag: RegexFlag): readonly RegexFlag[] {
    const next = new Set(flags);

    if (next.has(flag)) {
        next.delete(flag);
    } else {
        next.add(flag);
    }

    return REGEX_FLAGS.filter((candidate) => next.has(candidate));
}

/** `["global", "multiline"]` → `"gm"`, always in display order. */
export function formatFlagLetters(flags: readonly RegexFlag[]): string {
    return REGEX_FLAGS.filter((flag) => flags.includes(flag))
        .map((flag) => FLAG_LETTERS[flag])
        .join("");
}

/** `"gmU"` → `["global", "multiline", "ungreedy"]`; unknown letters are dropped. */
export function parseFlagLetters(letters: string): readonly RegexFlag[] {
    const seen = new Set(letters);

    return REGEX_FLAGS.filter((flag) => seen.has(FLAG_LETTERS[flag]));
}

export function toEngineFlags(flags: readonly RegexFlag[]): string {
    const letters = REGEX_FLAGS.map((flag) => (flags.includes(flag) ? ENGINE_LETTERS[flag] : ""))
        .filter((letter): letter is string => letter !== undefined && letter.length > 0)
        .join("");

    return `${INDICES_FLAG}${letters}`;
}
