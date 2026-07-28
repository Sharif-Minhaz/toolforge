import { describe, expect, test } from "bun:test";

import { LOREM_AMOUNT_PRESETS, MAX_LOREM_AMOUNT } from "@/modules/lorem/domain/constants";
import { getCorpus, getSourceLabel, supportsOpener } from "@/modules/lorem/domain/corpora";
import { LOREM_SOURCES, LOREM_UNITS } from "@/modules/lorem/types";

describe("corpora", () => {
    test("defines a corpus for every registered source", () => {
        for (const source of LOREM_SOURCES) {
            expect(getCorpus(source)).toBeDefined();
        }
    });

    test("gives every corpus a distinct label", () => {
        const labels = LOREM_SOURCES.map(getSourceLabel);

        expect(new Set(labels).size).toBe(labels.length);
    });

    test("tags every corpus with a language, so the output can carry lang", () => {
        for (const source of LOREM_SOURCES) {
            expect(getCorpus(source).lang.length).toBeGreaterThan(0);
        }
    });

    test("gives every prose corpus enough words to compose a sentence", () => {
        for (const source of LOREM_SOURCES) {
            const corpus = getCorpus(source);

            if (corpus.kind !== "prose") {
                continue;
            }

            expect(corpus.words.length).toBeGreaterThan(40);
            expect(corpus.opener.length).toBeGreaterThan(0);
        }
    });

    test("keeps every pool free of stray whitespace", () => {
        for (const source of LOREM_SOURCES) {
            const corpus = getCorpus(source);
            const entries =
                corpus.kind === "prose"
                    ? [...corpus.words, ...corpus.opener]
                    : corpus.kind === "tokens"
                      ? corpus.atoms
                      : [];

            for (const entry of entries) {
                expect(entry).toBe(entry.trim());
                expect(entry).not.toContain(" ");
                expect(entry.length).toBeGreaterThan(0);
            }
        }
    });

    test("keeps every emoji a single code point", () => {
        const corpus = getCorpus("emoji");

        if (corpus.kind !== "tokens") {
            throw new Error("emoji must stay a token corpus");
        }

        for (const atom of corpus.atoms) {
            expect([...atom]).toHaveLength(1);
        }
    });

    test("offers no opener for a source that has no opening line", () => {
        expect(supportsOpener("lorem")).toBe(true);
        expect(supportsOpener("bangla")).toBe(true);
        expect(supportsOpener("pangram")).toBe(false);
        expect(supportsOpener("alphabet")).toBe(false);
        expect(supportsOpener("emoji")).toBe(false);
    });

    test("ends a pangram the way a sentence ends", () => {
        const corpus = getCorpus("pangram");

        if (corpus.kind !== "phrases") {
            throw new Error("pangram must stay a phrase corpus");
        }

        for (const phrase of corpus.phrases) {
            expect(phrase).toMatch(/[.!?]$/);
        }
    });
});

describe("presets", () => {
    test("offers presets for every unit, all inside that unit's range", () => {
        for (const unit of LOREM_UNITS) {
            const presets = LOREM_AMOUNT_PRESETS[unit];

            expect(presets.length).toBeGreaterThan(0);

            for (const preset of presets) {
                expect(preset).toBeGreaterThanOrEqual(1);
                expect(preset).toBeLessThanOrEqual(MAX_LOREM_AMOUNT[unit]);
            }
        }
    });

    test("lists presets in ascending order", () => {
        for (const unit of LOREM_UNITS) {
            const presets = [...LOREM_AMOUNT_PRESETS[unit]];

            expect(presets).toEqual(presets.toSorted((a, b) => a - b));
        }
    });
});
