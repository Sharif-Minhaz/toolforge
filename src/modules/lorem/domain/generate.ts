import type { LoremGenerationResult, LoremOptions, LoremUnit, RandomSource } from "../types";
import {
    COMMA_PROBABILITY,
    MAX_LOREM_AMOUNT,
    MAX_PARAGRAPH_SENTENCES,
    MAX_SENTENCE_WORDS,
    MAX_TOKEN_RUN,
    MIN_LOREM_AMOUNT,
    MIN_LOREM_PARAGRAPHS,
    MAX_LOREM_PARAGRAPHS,
    MIN_PARAGRAPH_SENTENCES,
    MIN_SENTENCE_WORDS,
    MIN_TOKEN_RUN,
    MIN_WORDS_FOR_COMMA,
} from "./constants";
import { getCorpus, supportsOpener, type LoremCorpus } from "./corpora";
import { joinBlocks, renderBlocks } from "./format";

/**
 * Placeholder-text generation. Pure and deterministic given a random source,
 * so the server renders the first result and the tests can pin every branch.
 *
 * Nothing here is cryptographic — `Math.random` is exactly right for filler
 * copy, and reaching for `crypto` would only make the generator slower.
 */

/* ------------------------------------------------------------ counting --- */

/** Code points, so one emoji is one character rather than two. */
function countCodePoints(text: string): number {
    return [...text].length;
}

function sliceCodePoints(text: string, count: number): string {
    return [...text].slice(0, count).join("");
}

function countWords(text: string): number {
    return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/* -------------------------------------------------------------- random --- */

function randomInt(random: RandomSource, min: number, max: number): number {
    return min + Math.floor(random() * (max - min + 1));
}

/** Clamped, so a stubbed source returning exactly 1 cannot index past the end. */
function pick<T>(random: RandomSource, items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

/* ----------------------------------------------------------- sentences --- */

/**
 * What a sentence gets when a trim cuts its own ending off. A clipped phrase
 * still reads as a sentence and wants a full stop; a run of emoji or random
 * letters was never a sentence and would only look odd with one.
 */
function sentenceTerminator(corpus: LoremCorpus): string {
    switch (corpus.kind) {
        case "prose":
            return corpus.sentenceEnd;
        case "phrases":
            return ".";
        case "tokens":
            return "";
    }
}

function buildProseSentence(
    corpus: Extract<LoremCorpus, { kind: "prose" }>,
    random: RandomSource,
    opener: readonly string[] | null,
): string {
    const lead = opener ?? [];
    // An opener is never cut short: it is the line the reader recognises.
    const length = Math.max(randomInt(random, MIN_SENTENCE_WORDS, MAX_SENTENCE_WORDS), lead.length);
    const words = [...lead];

    while (words.length < length) {
        words.push(pick(random, corpus.words));
    }

    // Never inside the opener: that line is the one the reader recognises, and
    // a comma dropped into the middle of it reads as a bug.
    const commaFloor = Math.max(2, lead.length);

    if (length >= MIN_WORDS_FOR_COMMA && length - 3 >= commaFloor && random() < COMMA_PROBABILITY) {
        const at = randomInt(random, commaFloor, length - 3);
        words[at] = `${words[at]},`;
    }

    const text = words.join(" ");

    if (!corpus.capitalize) {
        return `${text}${corpus.sentenceEnd}`;
    }

    const [first, ...rest] = text;

    return `${first.toUpperCase()}${rest.join("")}${corpus.sentenceEnd}`;
}

function buildTokenSentence(
    corpus: Extract<LoremCorpus, { kind: "tokens" }>,
    random: RandomSource,
): string {
    const runs = randomInt(random, MIN_TOKEN_RUN, MAX_TOKEN_RUN);
    const tokens: string[] = [];

    for (let index = 0; index < runs; index += 1) {
        const atoms = randomInt(random, corpus.minAtoms, corpus.maxAtoms);
        let token = "";

        for (let atom = 0; atom < atoms; atom += 1) {
            token += pick(random, corpus.atoms);
        }

        tokens.push(token);
    }

    return tokens.join(" ");
}

function buildSentence(corpus: LoremCorpus, random: RandomSource, opener: boolean): string {
    switch (corpus.kind) {
        case "prose":
            return buildProseSentence(corpus, random, opener ? corpus.opener : null);
        case "phrases":
            // Scrambling a pangram stops it being one, so phrases go out whole.
            return opener ? corpus.phrases[0] : pick(random, corpus.phrases);
        case "tokens":
            return buildTokenSentence(corpus, random);
    }
}

/**
 * Hands out sentences one at a time, so only the very first one in the whole
 * batch carries the opener no matter which paragraph it lands in.
 */
function createSentenceSource(
    corpus: LoremCorpus,
    random: RandomSource,
    startWithOpener: boolean,
): () => string {
    let first = true;

    return () => {
        const opener = first && startWithOpener;
        first = false;

        return buildSentence(corpus, random, opener);
    };
}

/* ---------------------------------------------------------- paragraphs --- */

type ParagraphDraft = {
    readonly text: string;
    readonly sentences: number;
};

/** Spreads a total over buckets as evenly as it divides, remainder first. */
function distribute(total: number, buckets: number): number[] {
    const size = Math.floor(total / buckets);
    const remainder = total % buckets;

    return Array.from({ length: buckets }, (_, index) => size + (index < remainder ? 1 : 0));
}

function trimSentenceToWords(sentence: string, keep: number, corpus: LoremCorpus): string {
    const words = sentence.split(" ");

    if (keep >= words.length) {
        return sentence;
    }

    const kept = words.slice(0, keep);
    // The cut lands mid-sentence, so whatever punctuation the old final word
    // carried is now wrong.
    kept[kept.length - 1] =
        kept[kept.length - 1].replace(/[.,;:!?।]+$/u, "") + sentenceTerminator(corpus);

    return kept.join(" ");
}

function buildBySentences(nextSentence: () => string, count: number): ParagraphDraft {
    const parts = Array.from({ length: count }, () => nextSentence());

    return { text: parts.join(" "), sentences: count };
}

function buildByWords(
    nextSentence: () => string,
    corpus: LoremCorpus,
    target: number,
): ParagraphDraft {
    const parts: string[] = [];
    let used = 0;

    while (used < target) {
        const sentence = nextSentence();
        const words = countWords(sentence);

        if (used + words <= target) {
            parts.push(sentence);
            used += words;

            continue;
        }

        parts.push(trimSentenceToWords(sentence, target - used, corpus));
        used = target;
    }

    return { text: parts.join(" "), sentences: parts.length };
}

/**
 * Characters is an exact cut, clipped word and all. That is the point of it —
 * the reason to ask for 140 characters is to see what a field does at 140.
 */
function buildByCharacters(nextSentence: () => string, target: number): ParagraphDraft {
    const parts: string[] = [];
    let length = 0;

    while (length < target) {
        const sentence = nextSentence();
        length += (parts.length > 0 ? 1 : 0) + countCodePoints(sentence);
        parts.push(sentence);
    }

    // A sentence only counts if the cut left something of it behind.
    let consumed = 0;
    let sentences = 0;

    for (const part of parts) {
        const start = sentences === 0 ? 0 : consumed + 1;

        if (start >= target) {
            break;
        }

        sentences += 1;
        consumed = start + countCodePoints(part);
    }

    return { text: sliceCodePoints(parts.join(" "), target), sentences };
}

function buildDrafts(
    options: LoremOptions,
    corpus: LoremCorpus,
    nextSentence: () => string,
    random: RandomSource,
): ParagraphDraft[] {
    if (options.unit === "paragraphs") {
        return Array.from({ length: options.amount }, () =>
            buildBySentences(
                nextSentence,
                randomInt(random, MIN_PARAGRAPH_SENTENCES, MAX_PARAGRAPH_SENTENCES),
            ),
        );
    }

    // Asking for 3 words across 10 paragraphs cannot fill 10 of them, and an
    // empty paragraph is worse than a missing one.
    const targets = distribute(options.amount, Math.min(options.paragraphs, options.amount));

    switch (options.unit) {
        case "words":
            return targets.map((target) => buildByWords(nextSentence, corpus, target));
        case "characters":
            return targets.map((target) => buildByCharacters(nextSentence, target));
        case "sentences":
            return targets.map((target) => buildBySentences(nextSentence, target));
    }
}

/* -------------------------------------------------------- constraints --- */

export function isValidAmount(unit: LoremUnit, amount: number): boolean {
    return (
        Number.isInteger(amount) && amount >= MIN_LOREM_AMOUNT && amount <= MAX_LOREM_AMOUNT[unit]
    );
}

export function isValidParagraphCount(paragraphs: number): boolean {
    return (
        Number.isInteger(paragraphs) &&
        paragraphs >= MIN_LOREM_PARAGRAPHS &&
        paragraphs <= MAX_LOREM_PARAGRAPHS
    );
}

/** Every unit has its own ceiling, so switching unit can strand the amount. */
export function clampAmount(unit: LoremUnit, amount: number): number {
    if (!Number.isFinite(amount)) {
        return MIN_LOREM_AMOUNT;
    }

    return Math.min(MAX_LOREM_AMOUNT[unit], Math.max(MIN_LOREM_AMOUNT, Math.trunc(amount)));
}

export function clampParagraphCount(paragraphs: number): number {
    if (!Number.isFinite(paragraphs)) {
        return MIN_LOREM_PARAGRAPHS;
    }

    return Math.min(MAX_LOREM_PARAGRAPHS, Math.max(MIN_LOREM_PARAGRAPHS, Math.trunc(paragraphs)));
}

/**
 * Counting paragraphs and then splitting across paragraphs is the same
 * setting twice, so the split control goes quiet instead of doing nothing.
 * Shared by the domain and the UI so the two can never disagree.
 */
export function supportsParagraphSplit(unit: LoremUnit): boolean {
    return unit !== "paragraphs";
}

/* -------------------------------------------------------------- public --- */

export function generateRandomText(
    options: LoremOptions,
    random: RandomSource = Math.random,
): LoremGenerationResult {
    if (!isValidAmount(options.unit, options.amount)) {
        return { ok: false, reason: "invalid_amount" };
    }

    if (!isValidParagraphCount(options.paragraphs)) {
        return { ok: false, reason: "invalid_paragraphs" };
    }

    const corpus = getCorpus(options.source);
    const nextSentence = createSentenceSource(
        corpus,
        random,
        options.startWithOpener && supportsOpener(options.source),
    );

    const drafts = buildDrafts(options, corpus, nextSentence, random);
    const paragraphs = drafts.map((draft) => draft.text);
    const blocks = renderBlocks(paragraphs, options.format);

    return {
        ok: true,
        paragraphs,
        blocks,
        text: joinBlocks(blocks, options.format),
        // Measured on the text itself, never on the markup wrapped around it —
        // asking for 100 words and being told 106 because of `<p>` tags would
        // make the counter useless.
        stats: {
            words: paragraphs.reduce((total, text) => total + countWords(text), 0),
            characters: paragraphs.reduce((total, text) => total + countCodePoints(text), 0),
            sentences: drafts.reduce((total, draft) => total + draft.sentences, 0),
            paragraphs: paragraphs.length,
        },
        lang: corpus.lang,
    };
}
