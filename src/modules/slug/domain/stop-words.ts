/**
 * The English function words a headline can usually lose without becoming
 * ambiguous. Kept short on purpose: an aggressive list turns
 * "how to be a better reviewer" into "better reviewer", which reads as a
 * different article. Stop words are language-specific, and this list only
 * claims to know English — the option says so in both locales.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "its",
    "of",
    "on",
    "onto",
    "or",
    "that",
    "the",
    "their",
    "then",
    "there",
    "these",
    "this",
    "those",
    "to",
    "was",
    "were",
    "will",
    "with",
]);

export function isStopWord(word: string): boolean {
    // Lowercased here rather than by the caller, so the check works the same
    // whether or not the reader asked for lowercase output.
    return STOP_WORDS.has(word.toLowerCase());
}
