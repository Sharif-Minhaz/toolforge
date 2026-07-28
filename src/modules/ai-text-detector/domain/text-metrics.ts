import type { TextMetrics } from "../types";
import { tokenizeWords } from "./words";

/** Full stop, question, exclamation, ellipsis, and the Bengali daṛi. */
const SENTENCE_TERMINATORS = /[.!?…।]+/u;

const EMPTY_METRICS: TextMetrics = {
    characters: 0,
    words: 0,
    sentences: 0,
    averageSentenceWords: 0,
    uniqueWordRatio: 0,
};

export function countWords(text: string): number {
    return tokenizeWords(text).length;
}

/**
 * Prose without a terminator is still one sentence — a headline or a fragment
 * should not report zero.
 */
export function countSentences(text: string): number {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
        return 0;
    }

    const parts = trimmed
        .split(SENTENCE_TERMINATORS)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

    return Math.max(parts.length, 1);
}

/**
 * The offline half of the tool: sentence rhythm and vocabulary spread are the
 * signals a reader can judge without sending anything anywhere. Pure, so the
 * server pass and the client agree on every figure.
 */
export function getTextMetrics(text: string): TextMetrics {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
        return EMPTY_METRICS;
    }

    const words = tokenizeWords(trimmed);
    const sentences = countSentences(trimmed);
    const distinct = new Set(words.map((word) => word.toLowerCase()));

    return {
        characters: trimmed.length,
        words: words.length,
        sentences,
        averageSentenceWords:
            sentences === 0 ? 0 : Math.round((words.length / sentences) * 10) / 10,
        uniqueWordRatio: words.length === 0 ? 0 : Math.round((distinct.size / words.length) * 100),
    };
}
