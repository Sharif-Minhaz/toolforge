import type {
    PasswordGenerationResult,
    PasswordMode,
    PasswordOptions,
    PasswordSeparator,
    RandomBytes,
} from "../types";
import { buildAlphabet, countComposition, type Alphabet } from "./alphabets";
import { PASSWORD_LENGTH_RANGE } from "./constants";
import {
    classifyStrength,
    countRandomKeyspace,
    log2BigInt,
    passphraseEntropyBits,
    pinEntropyBits,
} from "./entropy";
import { cryptoRandomBytes, pick, pickCharacter, randomIndex, shuffle } from "./random";
import { PASSPHRASE_WORDS } from "./wordlist";

/**
 * The one entry point the page and the island both call. Pure given a byte
 * source, so every branch is reachable from a test.
 */

const DIGITS = "0123456789";

export const SEPARATOR_CHARACTERS: Record<PasswordSeparator, string> = {
    hyphen: "-",
    dot: ".",
    underscore: "_",
    space: " ",
    none: "",
};

/* ---------------------------------------------------------- constraints --- */

export function isValidLength(mode: PasswordMode, length: number): boolean {
    const { min, max } = PASSWORD_LENGTH_RANGE[mode];

    return Number.isInteger(length) && length >= min && length <= max;
}

/** Each mode has its own range, so switching mode can strand the current value. */
export function clampLength(mode: PasswordMode, length: number): number {
    const { min, max } = PASSWORD_LENGTH_RANGE[mode];

    if (!Number.isFinite(length)) {
        return min;
    }

    return Math.min(max, Math.max(min, Math.trunc(length)));
}

/* ------------------------------------------------------------ composing --- */

/**
 * Guarantees one character from every selected class, then fills the rest from
 * the whole pool and shuffles so the guaranteed characters are not always at the
 * front.
 *
 * The guarantee is what makes the keyspace smaller than `poolSize ** length`;
 * `countRandomKeyspace` counts the difference rather than ignoring it.
 */
function composeRandom(alphabet: Alphabet, length: number, randomBytes: RandomBytes): string {
    const characters = alphabet.classes.map((entry) =>
        pickCharacter(entry.characters, randomBytes),
    );

    while (characters.length < length) {
        characters.push(pickCharacter(alphabet.pool, randomBytes));
    }

    return shuffle(characters, randomBytes).join("");
}

function capitalizeWord(word: string): string {
    return `${word[0].toUpperCase()}${word.slice(1)}`;
}

function composePassphrase(options: PasswordOptions, randomBytes: RandomBytes): string {
    const words = Array.from({ length: options.length }, () => {
        const word = pick(PASSPHRASE_WORDS, randomBytes);

        return options.capitalize ? capitalizeWord(word) : word;
    });

    if (options.includeNumber) {
        // One digit on one word, both chosen at random — which is exactly the
        // `log2(words × 10)` that `passphraseEntropyBits` credits it with.
        const at = randomIndex(words.length, randomBytes);
        words[at] += pickCharacter(DIGITS, randomBytes);
    }

    return words.join(SEPARATOR_CHARACTERS[options.separator]);
}

function composePin(length: number, randomBytes: RandomBytes): string {
    return Array.from({ length }, () => pickCharacter(DIGITS, randomBytes)).join("");
}

/* --------------------------------------------------------------- public --- */

export function generatePassword(
    options: PasswordOptions,
    randomBytes: RandomBytes = cryptoRandomBytes,
): PasswordGenerationResult {
    if (!isValidLength(options.mode, options.length)) {
        return { ok: false, reason: "invalid_length" };
    }

    if (options.mode === "memorable") {
        const password = composePassphrase(options, randomBytes);

        return describe(password, passphraseEntropyBits(options), PASSPHRASE_WORDS.length);
    }

    if (options.mode === "pin") {
        const password = composePin(options.length, randomBytes);

        return describe(password, pinEntropyBits(options.length), DIGITS.length);
    }

    const alphabet = buildAlphabet(options);

    if (alphabet.classes.length === 0) {
        return { ok: false, reason: "no_character_class" };
    }

    const password = composeRandom(alphabet, options.length, randomBytes);
    const entropyBits = log2BigInt(countRandomKeyspace(alphabet, options.length));

    return describe(password, entropyBits, alphabet.pool.length);
}

function describe(
    password: string,
    entropyBits: number,
    poolSize: number,
): PasswordGenerationResult {
    return {
        ok: true,
        password,
        entropyBits,
        poolSize,
        strength: classifyStrength(entropyBits),
        composition: countComposition(password),
    };
}
