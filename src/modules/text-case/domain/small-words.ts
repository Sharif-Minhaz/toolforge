/**
 * The words Title Case leaves in lower case.
 *
 * This list is not ours. It is the one from John Gruber's `titlecase.pl`, the
 * script most "title case" implementations on the web descend from, and it is
 * copied rather than improved on for the reason rule 45 gives: the output is
 * read by somebody else, who is comparing it against what every other converter
 * produced. A list we thought was better would make this tool the odd one out
 * on `and`, `nor` or `per` and give no way to tell which answer was right.
 *
 * <https://daringfireball.net/2008/05/title_case>
 *
 * One difference, and it is in the splitter rather than in the list: that script
 * matches `v.` and `vs.` with their full stops, and the word finder here hands
 * over `v` and `vs` with the stop left in the gap between words. So the dotted
 * spellings are absent — they could never match — and the bare ones do the work
 * for both.
 */
export const TITLE_SMALL_WORDS: ReadonlySet<string> = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "but",
    "by",
    "en",
    "for",
    "if",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "v",
    "via",
    "vs",
]);

/**
 * Whether a word is one Title Case keeps small.
 *
 * `toLowerCase`, never `toLocaleLowerCase`: the latter reads the host's locale,
 * so `IN` would fold to a dotless `ın` in a Turkish reader's browser and stop
 * matching a list written in English — while the server, on a different locale,
 * matched it. That is a hydration mismatch as well as a wrong answer.
 */
export function isSmallWord(word: string): boolean {
    return TITLE_SMALL_WORDS.has(word.toLowerCase());
}
