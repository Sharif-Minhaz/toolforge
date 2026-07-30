import { describe, expect, test } from "bun:test";

import {
    ALPHABETS,
    buildAlphabet,
    supportsCharacterPool,
} from "@/modules/password/domain/alphabets";
import {
    DEFAULT_PASSWORD_OPTIONS,
    PASSWORD_LENGTH_RANGE,
    STRENGTH_THRESHOLD_BITS,
} from "@/modules/password/domain/constants";
import {
    classifyStrength,
    countRandomKeyspace,
    log2BigInt,
    passphraseEntropyBits,
    pinEntropyBits,
} from "@/modules/password/domain/entropy";
import { PASSPHRASE_WORDS } from "@/modules/password/domain/wordlist";
import {
    CHARACTER_CLASSES,
    PASSWORD_MODES,
    type CharacterClass,
    type PasswordOptions,
    type PasswordStrength,
} from "@/modules/password/types";

function options(patch: Partial<PasswordOptions>): PasswordOptions {
    return { ...DEFAULT_PASSWORD_OPTIONS, ...patch };
}

const ALL_CLASSES_OFF = {
    uppercase: false,
    lowercase: false,
    numbers: false,
    symbols: false,
} as const;

describe("log2BigInt", () => {
    test("is exact on the small values a double can hold", () => {
        expect(log2BigInt(1n)).toBe(0);
        expect(log2BigInt(2n)).toBe(1);
        expect(log2BigInt(1024n)).toBe(10);
        expect(log2BigInt(2n ** 52n)).toBe(52);
    });

    test("keeps its precision far past what a double can hold", () => {
        expect(log2BigInt(2n ** 200n)).toBeCloseTo(200, 10);
        expect(log2BigInt(2n ** 837n)).toBeCloseTo(837, 10);
        expect(log2BigInt(10n ** 250n)).toBeCloseTo(250 * Math.log2(10), 8);
    });

    test("returns zero for a keyspace that does not exist", () => {
        expect(log2BigInt(0n)).toBe(0);
        expect(log2BigInt(-4n)).toBe(0);
    });
});

describe("countRandomKeyspace", () => {
    test("counts every string when only one class is selected", () => {
        const alphabet = buildAlphabet(options({ ...ALL_CLASSES_OFF, numbers: true }));

        // Nothing to exclude with a single class, so it is the plain power.
        expect(countRandomKeyspace(alphabet, 3)).toBe(1000n);
    });

    test("drops the strings that miss a required class", () => {
        // A hand-checkable case: two classes, one usable character each. Only
        // "aB" and "Ba" contain one of each, so the keyspace is 2, not 2² = 4.
        const alphabet = {
            classes: [
                { name: "uppercase" as const, characters: "B" },
                { name: "lowercase" as const, characters: "a" },
            ],
            pool: "Ba",
        };

        expect(countRandomKeyspace(alphabet, 2)).toBe(2n);
        expect(log2BigInt(countRandomKeyspace(alphabet, 2))).toBe(1);
    });

    test("stays below the naive power, because the guarantee costs keyspace", () => {
        const alphabet = buildAlphabet(DEFAULT_PASSWORD_OPTIONS);
        const exact = countRandomKeyspace(alphabet, 20);
        const naive = BigInt(alphabet.pool.length) ** 20n;

        expect(alphabet.pool.length).toBe(94);
        expect(exact).toBeLessThan(naive);
        // Only a shade below at this length — which is the point of counting it
        // rather than guessing how much it matters.
        expect(log2BigInt(naive) - log2BigInt(exact)).toBeLessThan(0.5);
    });

    test("is never zero, because the shortest random length still fits every class", () => {
        expect(PASSWORD_LENGTH_RANGE.random.min).toBeGreaterThanOrEqual(CHARACTER_CLASSES.length);

        const alphabet = buildAlphabet(DEFAULT_PASSWORD_OPTIONS);

        expect(countRandomKeyspace(alphabet, PASSWORD_LENGTH_RANGE.random.min)).toBeGreaterThan(0n);
    });
});

describe("buildAlphabet", () => {
    test("no combination of exclusions can empty a selected class", () => {
        for (let mask = 1; mask < 1 << CHARACTER_CLASSES.length; mask += 1) {
            const flags = Object.fromEntries(
                CHARACTER_CLASSES.map((name, index) => [name, Boolean(mask & (1 << index))]),
            ) as Record<CharacterClass, boolean>;

            for (const excludeSimilar of [false, true]) {
                for (const excludeAmbiguous of [false, true]) {
                    const alphabet = buildAlphabet(
                        options({ ...flags, excludeSimilar, excludeAmbiguous }),
                    );
                    const selected = CHARACTER_CLASSES.filter((name) => flags[name]).length;

                    expect(alphabet.classes).toHaveLength(selected);
                    expect(alphabet.pool.length).toBeGreaterThan(0);
                }
            }
        }
    });

    test("the four alphabets together are the 94 printable ASCII characters", () => {
        const all = CHARACTER_CLASSES.map((name) => ALPHABETS[name]).join("");

        expect(all).toHaveLength(94);
        expect(new Set(all).size).toBe(94);
        expect([...all].every((character) => character >= "!" && character <= "~")).toBe(true);
    });

    test("both exclusions together leave 67 characters", () => {
        const alphabet = buildAlphabet(options({ excludeSimilar: true, excludeAmbiguous: true }));

        expect(alphabet.pool.length).toBe(67);
    });

    test("reports no character pool outside random mode", () => {
        for (const mode of PASSWORD_MODES) {
            expect(supportsCharacterPool(mode)).toBe(mode === "random");
        }
    });
});

describe("passphraseEntropyBits", () => {
    test("credits exactly ten bits per word", () => {
        expect(passphraseEntropyBits(options({ mode: "memorable", length: 6 }))).toBe(60);
        expect(passphraseEntropyBits(options({ mode: "memorable", length: 12 }))).toBe(120);
    });

    test("credits nothing for capitalisation, which follows a rule", () => {
        const plain = passphraseEntropyBits(options({ mode: "memorable", length: 5 }));
        const capitalized = passphraseEntropyBits(
            options({ mode: "memorable", length: 5, capitalize: true }),
        );

        expect(capitalized).toBe(plain);
    });

    test("credits an appended digit with the word it lands on as well as its value", () => {
        const bits = passphraseEntropyBits(
            options({ mode: "memorable", length: 6, includeNumber: true }),
        );

        expect(bits).toBeCloseTo(60 + Math.log2(60), 10);
    });

    test("tracks the size of the list rather than a hardcoded ten", () => {
        expect(passphraseEntropyBits(options({ mode: "memorable", length: 4 }))).toBeCloseTo(
            4 * Math.log2(PASSPHRASE_WORDS.length),
            10,
        );
    });
});

describe("pinEntropyBits", () => {
    test("is 3.32 bits a digit and nothing more", () => {
        expect(pinEntropyBits(4)).toBeCloseTo(13.2877, 4);
        expect(pinEntropyBits(6)).toBeCloseTo(19.9316, 4);
    });
});

describe("classifyStrength", () => {
    test("lands on the band each threshold opens", () => {
        const expected: readonly [number, PasswordStrength][] = [
            [0, "very-weak"],
            [39.999, "very-weak"],
            [40, "weak"],
            [59.999, "weak"],
            [60, "fair"],
            [79.999, "fair"],
            [80, "strong"],
            [111.999, "strong"],
            [112, "very-strong"],
            [900, "very-strong"],
        ];

        for (const [bits, band] of expected) {
            expect(classifyStrength(bits)).toBe(band);
        }
    });

    test("agrees with the thresholds it was built from", () => {
        for (const [band, bits] of Object.entries(STRENGTH_THRESHOLD_BITS)) {
            expect(classifyStrength(bits)).toBe(band as PasswordStrength);
        }
    });

    test("a six-digit PIN is very weak and a six-word passphrase is not", () => {
        expect(classifyStrength(pinEntropyBits(6))).toBe("very-weak");
        expect(
            classifyStrength(passphraseEntropyBits(options({ mode: "memorable", length: 6 }))),
        ).toBe("fair");
    });
});
