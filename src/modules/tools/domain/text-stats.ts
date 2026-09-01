import type { TextStats } from "../types";

/**
 * Runs of non-whitespace separate words. Counted by matching rather than
 * splitting, because a split scores an empty string as one word and a leading
 * space as two.
 *
 * Deliberately not `splitWords` from `words.ts`: this is the number under the
 * box, and a reader comparing it against their word processor expects
 * `XMLHttpRequest` to be one word there, whatever the identifier builder makes
 * of it.
 */
const WORD = /[^\s]+/g;

/** Any of the three line endings, whichever the pasted text happens to use. */
const NEWLINE = /\r\n|\r|\n/g;

/** Size of a box, for the counter beneath it. */
export function describeText(text: string): TextStats {
    return {
        characters: [...text].length,
        words: text.match(WORD)?.length ?? 0,
        // An empty box is still one line, the one the caret sits on.
        lines: (text.match(NEWLINE)?.length ?? 0) + 1,
    };
}
