import type { DiffCompareFlags } from "../types";

/** Any run of whitespace, including the Unicode spaces `\s` covers. */
const WHITESPACE_RUN = /\s+/g;

/**
 * What a line is compared *by*, as opposed to what it is shown as. The raw text
 * is always kept for display, so an option that makes two lines match never
 * rewrites either of them.
 *
 * `toLowerCase` rather than `toLocaleLowerCase`: the locale-aware form folds
 * Turkish dotted I differently depending on the host, which would make the same
 * two files compare differently on the server and in the browser.
 */
export function comparisonKey(line: string, flags: DiffCompareFlags): string {
    let key = line;

    if (flags.ignoreWhitespace) {
        key = key.replace(WHITESPACE_RUN, " ").trim();
    }

    if (flags.ignoreCase) {
        key = key.toLowerCase();
    }

    return key;
}

export function comparisonKeys(lines: readonly string[], flags: DiffCompareFlags): string[] {
    return lines.map((line) => comparisonKey(line, flags));
}
