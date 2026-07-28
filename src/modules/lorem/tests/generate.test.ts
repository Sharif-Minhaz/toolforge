import { describe, expect, test } from "bun:test";

import {
    MAX_LOREM_AMOUNT,
    MAX_LOREM_PARAGRAPHS,
    MIN_LOREM_AMOUNT,
    MIN_LOREM_PARAGRAPHS,
} from "@/modules/lorem/domain/constants";
import { getCorpus } from "@/modules/lorem/domain/corpora";
import {
    clampAmount,
    clampParagraphCount,
    generateRandomText,
    isValidAmount,
    isValidParagraphCount,
    supportsParagraphSplit,
} from "@/modules/lorem/domain/generate";
import {
    LOREM_SOURCES,
    LOREM_UNITS,
    type LoremOptions,
    type LoremSource,
    type LoremUnit,
    type RandomSource,
} from "@/modules/lorem/types";

/** Deterministic LCG, so every assertion below is reproducible. */
function seeded(seed: number): RandomSource {
    let state = seed >>> 0;

    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

        return state / 0x100000000;
    };
}

const BASE: LoremOptions = {
    source: "lorem",
    unit: "words",
    amount: 40,
    paragraphs: 2,
    startWithOpener: false,
    format: "plain",
};

function generate(patch: Partial<LoremOptions>, seed = 7) {
    const result = generateRandomText({ ...BASE, ...patch }, seeded(seed));

    if (!result.ok) {
        throw new Error(`expected a result, got ${result.reason}`);
    }

    return result;
}

describe("generateRandomText — exact counts", () => {
    test("emits exactly the requested number of words, for every source", () => {
        for (const source of LOREM_SOURCES) {
            const result = generate({ source, unit: "words", amount: 37, paragraphs: 3 });

            expect(result.stats.words).toBe(37);
        }
    });

    test("emits exactly the requested number of characters, for every source", () => {
        for (const source of LOREM_SOURCES) {
            const result = generate({ source, unit: "characters", amount: 140, paragraphs: 2 });

            expect(result.stats.characters).toBe(140);
        }
    });

    test("emits exactly the requested number of sentences", () => {
        for (const source of LOREM_SOURCES) {
            const result = generate({ source, unit: "sentences", amount: 9, paragraphs: 4 });

            expect(result.stats.sentences).toBe(9);
        }
    });

    test("emits exactly the requested number of paragraphs", () => {
        for (const source of LOREM_SOURCES) {
            const result = generate({ source, unit: "paragraphs", amount: 5 });

            expect(result.stats.paragraphs).toBe(5);
            expect(result.blocks).toHaveLength(5);
        }
    });

    test("holds the count at both ends of every unit's range", () => {
        const measured: Record<LoremUnit, (stats: ReturnType<typeof generate>["stats"]) => number> =
            {
                words: (stats) => stats.words,
                characters: (stats) => stats.characters,
                sentences: (stats) => stats.sentences,
                paragraphs: (stats) => stats.paragraphs,
            };

        for (const unit of LOREM_UNITS) {
            for (const amount of [MIN_LOREM_AMOUNT, MAX_LOREM_AMOUNT[unit]]) {
                const result = generate({ unit, amount, paragraphs: 3 });

                expect(measured[unit](result.stats)).toBe(amount);
            }
        }
    });
});

describe("generateRandomText — paragraph split", () => {
    test("spreads the amount over the requested paragraphs", () => {
        const result = generate({ unit: "words", amount: 100, paragraphs: 4 });

        expect(result.stats.paragraphs).toBe(4);
        expect(result.stats.words).toBe(100);
    });

    test("never leaves a paragraph empty when the amount cannot fill them all", () => {
        const result = generate({ unit: "words", amount: 3, paragraphs: 10 });

        expect(result.stats.paragraphs).toBe(3);
        expect(result.blocks.every((block) => block.trim().length > 0)).toBe(true);
    });

    test("ignores the split when the unit is already paragraphs", () => {
        const spread = generate({ unit: "paragraphs", amount: 4, paragraphs: 9 });

        expect(spread.stats.paragraphs).toBe(4);
        expect(supportsParagraphSplit("paragraphs")).toBe(false);
        expect(supportsParagraphSplit("words")).toBe(true);
    });

    test("divides a remainder into the leading paragraphs", () => {
        const result = generate({ unit: "sentences", amount: 7, paragraphs: 3 });
        const perParagraph = result.blocks.map(
            (block) => block.split(".").filter((part) => part.trim().length > 0).length,
        );

        expect(perParagraph).toEqual([3, 2, 2]);
    });
});

function openingOf(source: LoremSource): string {
    const corpus = getCorpus(source);

    if (corpus.kind !== "prose") {
        return "";
    }

    const joined = corpus.opener.join(" ");

    return corpus.capitalize ? `${joined[0].toUpperCase()}${joined.slice(1)}` : joined;
}

describe("generateRandomText — the opener", () => {
    test("leads the very first sentence with the corpus opening", () => {
        for (const source of LOREM_SOURCES) {
            const corpus = getCorpus(source);

            if (corpus.kind !== "prose") {
                continue;
            }

            const result = generate({ source, startWithOpener: true, amount: 60, paragraphs: 3 });

            expect(result.blocks[0].startsWith(openingOf(source))).toBe(true);
        }
    });

    test("leads only the first sentence, not every paragraph", () => {
        const result = generate({
            startWithOpener: true,
            unit: "sentences",
            amount: 6,
            paragraphs: 3,
        });
        const opening = openingOf("lorem");

        expect(result.blocks[0].startsWith(opening)).toBe(true);
        expect(result.blocks[1].startsWith(opening)).toBe(false);
    });

    test("is a no-op for a source that has no opening line", () => {
        const withOpener = generate({ source: "emoji", startWithOpener: true }, 3);
        const without = generate({ source: "emoji", startWithOpener: false }, 3);

        expect(withOpener.text).toBe(without.text);
    });
});

describe("generateRandomText — per-corpus shape", () => {
    test("closes a Bangla sentence with a danda and never uppercases it", () => {
        const result = generate({ source: "bangla", unit: "sentences", amount: 4, paragraphs: 1 });

        expect(result.text).toContain("।");
        expect(result.text).not.toContain(".");
        expect(result.lang).toBe("bn");
    });

    test("emits pangrams whole rather than scrambling them", () => {
        const corpus = getCorpus("pangram");
        const result = generate({ source: "pangram", unit: "sentences", amount: 5, paragraphs: 1 });

        if (corpus.kind !== "phrases") {
            throw new Error("pangram must stay a phrase corpus");
        }

        for (const sentence of result.text.split(/(?<=[.!?])\s+/)) {
            expect(corpus.phrases).toContain(sentence);
        }
    });

    test("counts an emoji as one character, not two UTF-16 units", () => {
        const result = generate({ source: "emoji", unit: "characters", amount: 30, paragraphs: 1 });

        expect(result.stats.characters).toBe(30);
        // Emoji are astral, so the code-unit length runs ahead of the count.
        expect(result.text.length).toBeGreaterThan(30);
    });

    test("never cuts an emoji in half", () => {
        for (let amount = 1; amount <= 12; amount += 1) {
            const result = generate({ source: "emoji", unit: "characters", amount, paragraphs: 1 });

            // Iterating by code point surfaces a lone surrogate as its own
            // character, which is exactly the damage a naive slice would do.
            for (const character of result.text) {
                const code = character.codePointAt(0) ?? 0;

                expect(code < 0xd800 || code > 0xdfff).toBe(true);
            }
        }
    });

    test("carries the corpus language through to the caller", () => {
        expect(generate({ source: "kafka" }).lang).toBe("de");
        expect(generate({ source: "lorem" }).lang).toBe("la");
        expect(generate({ source: "alphabet" }).lang).toBe("en");
    });
});

describe("generateRandomText — formats", () => {
    test("plain text separates paragraphs with a blank line", () => {
        const result = generate({ unit: "paragraphs", amount: 3, format: "plain" });

        expect(result.text.split("\n\n")).toHaveLength(3);
    });

    test("html wraps each paragraph in a p element", () => {
        const result = generate({ unit: "paragraphs", amount: 2, format: "html" });

        expect(result.blocks).toHaveLength(2);
        for (const block of result.blocks) {
            expect(block.startsWith("<p>")).toBe(true);
            expect(block.endsWith("</p>")).toBe(true);
        }
    });

    test("counts the text, not the markup wrapped around it", () => {
        const plain = generate({ unit: "words", amount: 50, format: "plain" }, 11);
        const html = generate({ unit: "words", amount: 50, format: "html" }, 11);

        expect(html.stats).toEqual(plain.stats);
    });
});

describe("generateRandomText — boundaries", () => {
    test("rejects an amount outside the unit's range", () => {
        for (const unit of LOREM_UNITS) {
            expect(generateRandomText({ ...BASE, unit, amount: 0 })).toEqual({
                ok: false,
                reason: "invalid_amount",
            });
            expect(
                generateRandomText({ ...BASE, unit, amount: MAX_LOREM_AMOUNT[unit] + 1 }),
            ).toEqual({ ok: false, reason: "invalid_amount" });
        }
    });

    test("rejects a fractional, negative, or non-numeric amount", () => {
        for (const amount of [2.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(generateRandomText({ ...BASE, amount })).toEqual({
                ok: false,
                reason: "invalid_amount",
            });
        }
    });

    test("rejects a paragraph count outside its range", () => {
        for (const paragraphs of [0, MAX_LOREM_PARAGRAPHS + 1, 1.5, Number.NaN]) {
            expect(generateRandomText({ ...BASE, paragraphs })).toEqual({
                ok: false,
                reason: "invalid_paragraphs",
            });
        }
    });

    test("reports an invalid amount before an invalid paragraph count", () => {
        expect(generateRandomText({ ...BASE, amount: 0, paragraphs: 0 })).toEqual({
            ok: false,
            reason: "invalid_amount",
        });
    });
});

describe("validation helpers", () => {
    test("isValidAmount tracks the per-unit ceiling", () => {
        expect(isValidAmount("words", MAX_LOREM_AMOUNT.words)).toBe(true);
        expect(isValidAmount("sentences", MAX_LOREM_AMOUNT.words)).toBe(false);
        expect(isValidAmount("words", 0)).toBe(false);
    });

    test("isValidParagraphCount guards both ends", () => {
        expect(isValidParagraphCount(MIN_LOREM_PARAGRAPHS)).toBe(true);
        expect(isValidParagraphCount(MAX_LOREM_PARAGRAPHS)).toBe(true);
        expect(isValidParagraphCount(MAX_LOREM_PARAGRAPHS + 1)).toBe(false);
    });

    test("clampAmount pulls a stranded amount down to the new unit's ceiling", () => {
        expect(clampAmount("sentences", 5000)).toBe(MAX_LOREM_AMOUNT.sentences);
        expect(clampAmount("words", 42)).toBe(42);
        expect(clampAmount("words", 0)).toBe(MIN_LOREM_AMOUNT);
        expect(clampAmount("words", Number.NaN)).toBe(MIN_LOREM_AMOUNT);
        expect(clampAmount("words", 12.9)).toBe(12);
    });

    test("clampParagraphCount keeps the split inside its range", () => {
        expect(clampParagraphCount(0)).toBe(MIN_LOREM_PARAGRAPHS);
        expect(clampParagraphCount(9999)).toBe(MAX_LOREM_PARAGRAPHS);
        expect(clampParagraphCount(Number.NaN)).toBe(MIN_LOREM_PARAGRAPHS);
    });
});

describe("generateRandomText — determinism", () => {
    test("the same seed and options produce the same text", () => {
        const options: LoremOptions = { ...BASE, source: "kafka", amount: 80, paragraphs: 3 };

        expect(generateRandomText(options, seeded(99))).toEqual(
            generateRandomText(options, seeded(99)),
        );
    });

    test("a different seed produces different text", () => {
        const options: LoremOptions = { ...BASE, amount: 120, paragraphs: 2 };
        const first = generateRandomText(options, seeded(1));
        const second = generateRandomText(options, seeded(2));

        if (!first.ok || !second.ok) {
            throw new Error("both generations should succeed");
        }

        expect(first.text).not.toBe(second.text);
    });
});
