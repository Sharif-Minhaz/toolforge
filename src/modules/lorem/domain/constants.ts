import type { LoremOptions, LoremUnit } from "../types";

export const MIN_LOREM_AMOUNT = 1;

/**
 * Per-unit ceilings. Every one of these caps a single synchronous batch at
 * roughly the same amount of text, so the generator never blocks the main
 * thread noticeably regardless of which unit the reader picked.
 */
export const MAX_LOREM_AMOUNT: Record<LoremUnit, number> = {
    words: 5000,
    characters: 30000,
    sentences: 500,
    paragraphs: 100,
};

export const MIN_LOREM_PARAGRAPHS = 1;

export const MAX_LOREM_PARAGRAPHS = 100;

export const LOREM_AMOUNT_PRESETS: Record<LoremUnit, readonly number[]> = {
    words: [10, 25, 50, 100, 250, 500],
    characters: [140, 250, 500, 1000, 2500, 5000],
    sentences: [1, 3, 5, 10, 25, 50],
    paragraphs: [1, 2, 3, 5, 8, 12],
};

export const LOREM_PARAGRAPH_PRESETS: readonly number[] = [1, 2, 3, 5, 8, 12];

export const DEFAULT_LOREM_OPTIONS: LoremOptions = {
    source: "lorem",
    unit: "words",
    amount: 100,
    paragraphs: 3,
    startWithOpener: true,
    format: "plain",
};

/* -------------------------------------------------------------- shape --- */

/** Words in a composed sentence, before any trimming to an exact target. */
export const MIN_SENTENCE_WORDS = 6;

export const MAX_SENTENCE_WORDS = 16;

/** Whitespace-separated runs in one token-source "sentence". */
export const MIN_TOKEN_RUN = 5;

export const MAX_TOKEN_RUN = 14;

export const MIN_PARAGRAPH_SENTENCES = 3;

export const MAX_PARAGRAPH_SENTENCES = 6;

/**
 * Sentences shorter than this never take a comma — a clause needs room on both
 * sides of it or the punctuation reads as a typo.
 */
export const MIN_WORDS_FOR_COMMA = 9;

export const COMMA_PROBABILITY = 0.4;
