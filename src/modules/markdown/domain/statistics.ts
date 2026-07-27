import type { MarkdownStatistics } from "../types";
import { READING_WORDS_PER_MINUTE } from "./constants";

/**
 * Runs of whitespace separate words. Counting with a split would score an empty
 * document as one word and a leading space as two, so the matches are counted
 * instead.
 */
const WORD = /[^\s]+/g;

const WHITESPACE = /\s/g;

/**
 * Size and reading time for the status bar.
 *
 * Deliberately counts the markdown as typed, syntax and all, rather than the
 * rendered prose: the number has to move while the author types, and a figure
 * that only updates once the parse settles reads as a bug.
 */
export function describeDocument(source: string): MarkdownStatistics {
    const words = source.match(WORD)?.length ?? 0;
    const characters = [...source].length;

    return {
        words,
        characters,
        charactersNoSpaces: characters - (source.match(WHITESPACE)?.length ?? 0),
        // An empty buffer is still one line, the one the caret sits on.
        lines: source.length === 0 ? 1 : source.split("\n").length,
        readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / READING_WORDS_PER_MINUTE)),
    };
}
