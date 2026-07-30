import { PASSWORD_STRENGTHS, type PasswordOptions, type PasswordStrength } from "../types";
import type { Alphabet } from "./alphabets";
import { STRENGTH_THRESHOLD_BITS } from "./constants";
import { PASSPHRASE_WORDS } from "./wordlist";

/**
 * How much work the generator actually cost an attacker.
 *
 * The number reported is the entropy of the *process*, not of the finished
 * string. That is the only figure worth showing: an attacker who knows which
 * generator and which settings produced a password searches exactly the keyspace
 * those settings define, and nothing about the resulting characters narrows it
 * further. Measuring the string instead is how tools end up calling
 * `Password1!` strong.
 */

/**
 * Exact log₂ of an arbitrarily large integer.
 *
 * The random-mode keyspace at 128 characters is a 250-digit number, so it has to
 * be counted in `bigint` and converted here rather than multiplied out in
 * floating point.
 */
export function log2BigInt(value: bigint): number {
    if (value <= 0n) {
        return 0;
    }

    const bits = value.toString(2).length;

    if (bits <= 53) {
        return Math.log2(Number(value));
    }

    // Keep the top 53 bits — everything a double can hold — and put the
    // discarded ones back as an exponent, so precision does not fall away as
    // the number grows.
    const shift = bits - 53;

    return Math.log2(Number(value >> BigInt(shift))) + shift;
}

/**
 * How many distinct passwords the random mode can produce.
 *
 * Not `poolSize ** length`. The generator guarantees at least one character from
 * every selected class, which *removes* the strings that miss a class — so the
 * naive power overstates the keyspace, and overstating it is the direction that
 * matters. Inclusion–exclusion over the selected classes counts what is left:
 *
 *     Σ over subsets S of the classes  (−1)^|S| · (poolSize − |S|'s characters)^length
 *
 * With at most four classes that is sixteen terms. The generator's shortest
 * random length (4) is never below the number of classes (4), so the count is
 * never zero — `tests/entropy.test.ts` pins that invariant.
 */
export function countRandomKeyspace(alphabet: Alphabet, length: number): bigint {
    const sizes = alphabet.classes.map((entry) => entry.characters.length);
    const poolSize = alphabet.pool.length;
    const exponent = BigInt(length);

    let total = 0n;

    for (let subset = 0; subset < 1 << sizes.length; subset += 1) {
        let removed = 0;
        let members = 0;

        for (let index = 0; index < sizes.length; index += 1) {
            if (subset & (1 << index)) {
                removed += sizes[index];
                members += 1;
            }
        }

        const term = BigInt(poolSize - removed) ** exponent;
        total += members % 2 === 0 ? term : -term;
    }

    return total;
}

/** Bits contributed by a passphrase: the words, plus the digit if one is added. */
export function passphraseEntropyBits(options: PasswordOptions): number {
    const words = options.length * Math.log2(PASSPHRASE_WORDS.length);

    // Capitalising every word is a rule, not a choice, so it adds nothing. The
    // digit does: it can land on any of the words, as any of ten values.
    const digit = options.includeNumber ? Math.log2(options.length * 10) : 0;

    return words + digit;
}

export function pinEntropyBits(length: number): number {
    return length * Math.log2(10);
}

export function classifyStrength(entropyBits: number): PasswordStrength {
    let strength: PasswordStrength = "very-weak";

    for (const candidate of PASSWORD_STRENGTHS) {
        if (entropyBits >= STRENGTH_THRESHOLD_BITS[candidate]) {
            strength = candidate;
        }
    }

    return strength;
}
