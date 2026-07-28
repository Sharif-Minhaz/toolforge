import {
    DELIMITER_CHARACTERS,
    REGEX_DELIMITERS,
    type RegexDelimiter,
    type RegexFlag,
} from "../types";
import { formatFlagLetters, parseFlagLetters } from "./flags";

/**
 * The delimiter never reaches the engine. It only decides how the pattern is
 * written down — which is exactly why it matters: `/` has to be escaped inside
 * a slash-delimited literal and not inside a tilde-delimited one, so the same
 * pattern copies out differently depending on where it is going.
 */

export type RegexLiteral = {
    readonly pattern: string;
    readonly flags: readonly RegexFlag[];
    readonly delimiter: RegexDelimiter;
};

/** Escapes the delimiter so the literal can be pasted back in one piece. */
export function formatLiteral(
    pattern: string,
    flags: readonly RegexFlag[],
    delimiter: RegexDelimiter,
): string {
    const character = DELIMITER_CHARACTERS[delimiter];
    const escaped = pattern.replaceAll(character, `\\${character}`);

    return `${character}${escaped}${character}${formatFlagLetters(flags)}`;
}

function findDelimiter(character: string): RegexDelimiter | null {
    return (
        REGEX_DELIMITERS.find((delimiter) => DELIMITER_CHARACTERS[delimiter] === character) ?? null
    );
}

/**
 * Reads a pasted `/…/gm`, so copying a literal out of source code and dropping
 * it in works without hand-stripping the wrapper. Returns `null` for anything
 * that is not a complete literal — including a bare pattern, which is the far
 * more common case and must be left exactly as typed.
 */
export function parseLiteral(input: string): RegexLiteral | null {
    const trimmed = input.trim();

    if (trimmed.length < 2) {
        return null;
    }

    const delimiter = findDelimiter(trimmed[0]);

    if (delimiter === null) {
        return null;
    }

    const character = trimmed[0];
    let closing = -1;

    for (let index = 1; index < trimmed.length; index += 1) {
        if (trimmed[index] === "\\") {
            index += 1;
            continue;
        }

        if (trimmed[index] === character) {
            closing = index;
        }
    }

    if (closing <= 0) {
        return null;
    }

    const flagLetters = trimmed.slice(closing + 1);

    // Trailing characters that are not flag letters mean this was never a
    // literal — `/usr/local/bin` should stay the pattern it looks like.
    if (formatFlagLetters(parseFlagLetters(flagLetters)).length !== flagLetters.length) {
        return null;
    }

    return {
        pattern: trimmed.slice(1, closing).replaceAll(`\\${character}`, character),
        flags: parseFlagLetters(flagLetters),
        delimiter,
    };
}
