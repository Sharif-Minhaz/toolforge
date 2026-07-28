/**
 * A word starts with a letter or digit and may carry inner apostrophes or
 * hyphens. `\p{M}` is the part that is easy to leave out and expensive to miss:
 * Bengali vowel signs and hasant are combining marks, not letters, so without
 * it every Bangla word fragments at each diacritic and the counts triple.
 */
export const WORD_PATTERN =
    /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’-][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu;

/** Shared by the metrics and by the blocklist, so both agree on what a word is. */
export function tokenizeWords(text: string): readonly string[] {
    return text.match(WORD_PATTERN) ?? [];
}
