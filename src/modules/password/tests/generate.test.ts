import { describe, expect, test } from "bun:test";

import {
    AMBIGUOUS_CHARACTERS,
    countComposition,
    SIMILAR_CHARACTERS,
} from "@/modules/password/domain/alphabets";
import {
    DEFAULT_PASSWORD_LENGTH,
    DEFAULT_PASSWORD_OPTIONS,
    PASSWORD_LENGTH_RANGE,
} from "@/modules/password/domain/constants";
import {
    clampLength,
    generatePassword,
    isValidLength,
    SEPARATOR_CHARACTERS,
} from "@/modules/password/domain/generate";
import { PASSPHRASE_WORDS } from "@/modules/password/domain/wordlist";
import {
    PASSWORD_MODES,
    PASSWORD_SEPARATORS,
    type PasswordOptions,
} from "@/modules/password/types";
import type { RandomBytes } from "@/modules/tools/types";

/** Deterministic byte source, so every assertion below is reproducible. */
function seededBytes(seed: number): RandomBytes {
    let state = seed >>> 0;

    return (length) => {
        const bytes = new Uint8Array(length);

        for (let index = 0; index < length; index += 1) {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            bytes[index] = (state >>> 24) & 0xff;
        }

        return bytes;
    };
}

function options(patch: Partial<PasswordOptions>): PasswordOptions {
    return { ...DEFAULT_PASSWORD_OPTIONS, ...patch };
}

function generate(patch: Partial<PasswordOptions>, seed = 17) {
    const result = generatePassword(options(patch), seededBytes(seed));

    if (!result.ok) {
        throw new Error(`expected a password, got ${result.reason}`);
    }

    return result;
}

describe("isValidLength", () => {
    test("accepts the bounds of every mode and nothing outside them", () => {
        for (const mode of PASSWORD_MODES) {
            const { min, max } = PASSWORD_LENGTH_RANGE[mode];

            expect(isValidLength(mode, min)).toBe(true);
            expect(isValidLength(mode, max)).toBe(true);
            expect(isValidLength(mode, min - 1)).toBe(false);
            expect(isValidLength(mode, max + 1)).toBe(false);
        }
    });

    test("rejects anything that is not a whole number", () => {
        expect(isValidLength("random", 12.5)).toBe(false);
        expect(isValidLength("random", Number.NaN)).toBe(false);
        expect(isValidLength("random", Number.POSITIVE_INFINITY)).toBe(false);
        expect(isValidLength("random", -8)).toBe(false);
    });
});

describe("clampLength", () => {
    test("pulls a value into the range of the mode it is switching to", () => {
        // A 64-character random password cannot become a 64-word passphrase.
        expect(clampLength("memorable", 64)).toBe(PASSWORD_LENGTH_RANGE.memorable.max);
        expect(clampLength("pin", 100)).toBe(PASSWORD_LENGTH_RANGE.pin.max);
        expect(clampLength("random", 1)).toBe(PASSWORD_LENGTH_RANGE.random.min);
    });

    test("truncates a fraction and falls back to the minimum for a non-number", () => {
        expect(clampLength("random", 20.9)).toBe(20);
        expect(clampLength("random", Number.NaN)).toBe(PASSWORD_LENGTH_RANGE.random.min);
        expect(clampLength("random", Number.POSITIVE_INFINITY)).toBe(
            PASSWORD_LENGTH_RANGE.random.min,
        );
    });

    test("leaves a value that already fits alone", () => {
        for (const mode of PASSWORD_MODES) {
            expect(clampLength(mode, DEFAULT_PASSWORD_LENGTH[mode])).toBe(
                DEFAULT_PASSWORD_LENGTH[mode],
            );
        }
    });
});

describe("generatePassword — failures", () => {
    test("reports an out-of-range length rather than composing something", () => {
        for (const length of [0, 3, 129, -1, 12.5, Number.NaN]) {
            expect(generatePassword(options({ length }), seededBytes(1))).toEqual({
                ok: false,
                reason: "invalid_length",
            });
        }
    });

    test("reports no character class when all four are switched off", () => {
        const result = generatePassword(
            options({
                uppercase: false,
                lowercase: false,
                numbers: false,
                symbols: false,
            }),
            seededBytes(1),
        );

        expect(result).toEqual({ ok: false, reason: "no_character_class" });
    });

    test("a mode without character classes ignores them being off", () => {
        for (const mode of ["memorable", "pin"] as const) {
            const result = generatePassword(
                options({
                    mode,
                    length: DEFAULT_PASSWORD_LENGTH[mode],
                    uppercase: false,
                    lowercase: false,
                    numbers: false,
                    symbols: false,
                }),
                seededBytes(1),
            );

            expect(result.ok).toBe(true);
        }
    });
});

describe("generatePassword — random mode", () => {
    test("emits exactly the requested number of characters", () => {
        for (const length of [4, 8, 20, 64, 128]) {
            expect(generate({ length }).password).toHaveLength(length);
        }
    });

    test("guarantees at least one character from every selected class", () => {
        for (let seed = 1; seed <= 40; seed += 1) {
            const composition = generate({ length: 4 }, seed).composition;

            expect(composition.uppercase).toBeGreaterThanOrEqual(1);
            expect(composition.lowercase).toBeGreaterThanOrEqual(1);
            expect(composition.numbers).toBeGreaterThanOrEqual(1);
            expect(composition.symbols).toBeGreaterThanOrEqual(1);
        }
    });

    test("draws only from the classes that are switched on", () => {
        const result = generate({
            length: 16,
            uppercase: false,
            symbols: false,
        });

        expect(result.composition.uppercase).toBe(0);
        expect(result.composition.symbols).toBe(0);
        expect(result.password).toMatch(/^[a-z0-9]+$/);
        expect(result.poolSize).toBe(36);
    });

    test("never emits an excluded character", () => {
        for (let seed = 1; seed <= 30; seed += 1) {
            const both = generate(
                { length: 40, excludeSimilar: true, excludeAmbiguous: true },
                seed,
            ).password;

            for (const character of SIMILAR_CHARACTERS + AMBIGUOUS_CHARACTERS) {
                expect(both).not.toInclude(character);
            }
        }
    });

    test("reports the pool the exclusions actually left", () => {
        expect(generate({ length: 20 }).poolSize).toBe(94);
        expect(generate({ length: 20, excludeSimilar: true }).poolSize).toBe(85);
        expect(generate({ length: 20, excludeAmbiguous: true }).poolSize).toBe(76);
        expect(
            generate({ length: 20, excludeSimilar: true, excludeAmbiguous: true }).poolSize,
        ).toBe(67);
    });

    test("its composition accounts for every character", () => {
        const result = generate({ length: 48 });
        const total = Object.values(result.composition).reduce((sum, count) => sum + count, 0);

        expect(total).toBe(48);
    });

    test("is deterministic for a given source, and moves when the source does", () => {
        expect(generate({ length: 24 }, 5).password).toBe(generate({ length: 24 }, 5).password);
        expect(generate({ length: 24 }, 5).password).not.toBe(generate({ length: 24 }, 6).password);
    });

    test("the default settings clear the top band", () => {
        const result = generate({});

        expect(result.entropyBits).toBeGreaterThan(112);
        expect(result.strength).toBe("very-strong");
    });
});

describe("generatePassword — memorable mode", () => {
    function memorable(patch: Partial<PasswordOptions>, seed = 23) {
        return generate({ mode: "memorable", length: 6, ...patch }, seed);
    }

    test("emits the requested number of words, all of them from the list", () => {
        for (const length of [3, 6, 12]) {
            const result = memorable({ length, separator: "hyphen" });
            const words = result.password.split("-");

            expect(words).toHaveLength(length);

            for (const word of words) {
                expect(PASSPHRASE_WORDS).toContain(word);
            }
        }
    });

    test("joins with the separator it was given", () => {
        for (const separator of PASSWORD_SEPARATORS) {
            const result = memorable({ separator, length: 4 });
            const glue = SEPARATOR_CHARACTERS[separator];

            if (glue === "") {
                expect(result.password).toMatch(/^[a-z]+$/);
                continue;
            }

            expect(result.password.split(glue)).toHaveLength(4);
        }
    });

    test("capitalises the first letter of every word when asked", () => {
        const result = memorable({ capitalize: true, separator: "hyphen" });

        for (const word of result.password.split("-")) {
            expect(word[0]).toBe(word[0].toUpperCase());
            expect(word.slice(1)).toBe(word.slice(1).toLowerCase());
        }
    });

    test("appends exactly one digit when asked, and none when not", () => {
        expect(memorable({ includeNumber: false }).password).not.toMatch(/\d/);

        for (let seed = 1; seed <= 20; seed += 1) {
            const password = memorable({ includeNumber: true }, seed).password;

            expect(password.match(/\d/g)).toHaveLength(1);
        }
    });

    test("credits ten bits a word, and counts the separator as a symbol", () => {
        const result = memorable({ length: 6, separator: "hyphen" });

        expect(result.entropyBits).toBe(60);
        expect(result.poolSize).toBe(PASSPHRASE_WORDS.length);
        // The hyphens are real characters in the finished string, so a form that
        // demands a symbol is satisfied by them. Reporting otherwise would lie.
        expect(countComposition(result.password).symbols).toBe(5);
    });

    test("a three-word passphrase is honestly labelled weak", () => {
        expect(memorable({ length: 3 }).strength).toBe("very-weak");
    });
});

describe("generatePassword — pin mode", () => {
    test("emits only digits, exactly as many as asked", () => {
        for (const length of [3, 6, 12]) {
            const result = generate({ mode: "pin", length });

            expect(result.password).toHaveLength(length);
            expect(result.password).toMatch(/^\d+$/);
            expect(result.poolSize).toBe(10);
            expect(result.composition.numbers).toBe(length);
        }
    });

    test("does not pretend a PIN is strong", () => {
        expect(generate({ mode: "pin", length: 4 }).strength).toBe("very-weak");
        expect(generate({ mode: "pin", length: 12 }).strength).toBe("very-weak");
    });

    test("ignores the character-class toggles entirely", () => {
        const withSymbols = generate({ mode: "pin", length: 8, symbols: true }, 9);
        const without = generate({ mode: "pin", length: 8, symbols: false }, 9);

        expect(withSymbols.password).toBe(without.password);
    });
});

describe("generatePassword — what it deliberately does not decide", () => {
    test("the attacker model does not change the password", () => {
        // Crack time is a lens on a finished result, not an input to it. If the
        // attacker were baked in, changing it would hand the reader a different
        // secret for asking a different question about the one they had.
        const throttled = generate({ length: 24, attack: "throttled" }, 31);
        const fast = generate({ length: 24, attack: "md5" }, 31);

        expect(throttled.password).toBe(fast.password);
        expect(throttled).not.toHaveProperty("crackTime");
    });
});

describe("generatePassword — with the real byte source", () => {
    test("works end to end on Web Crypto, in every mode", () => {
        for (const mode of PASSWORD_MODES) {
            const result = generatePassword(
                options({ mode, length: DEFAULT_PASSWORD_LENGTH[mode] }),
            );

            expect(result.ok).toBe(true);

            if (!result.ok) {
                continue;
            }

            expect(result.password.length).toBeGreaterThan(0);
            expect(result.entropyBits).toBeGreaterThan(0);
        }
    });

    test("does not repeat itself across calls", () => {
        const seen = new Set<string>();

        for (let index = 0; index < 200; index += 1) {
            const result = generatePassword(DEFAULT_PASSWORD_OPTIONS);

            expect(result.ok).toBe(true);

            if (result.ok) {
                seen.add(result.password);
            }
        }

        expect(seen.size).toBe(200);
    });
});
