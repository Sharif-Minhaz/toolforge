import type { ParseResult } from "../types";

/** Bangla digits read as the digits they are. */
const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

/**
 * Characters people put between digit groups: a comma, a space, an underscore
 * as in source code, and the thin and no-break spaces a word processor
 * substitutes. Allowed only between two digits of the whole part.
 */
const GROUP_SEPARATORS = new Set([",", " ", "_", " ", " ", " ", "٬"]);

function digitValue(char: string): string | null {
    if (char >= "0" && char <= "9") {
        return char;
    }

    const bangla = BANGLA_DIGITS.indexOf(char);

    return bangla === -1 ? null : String(bangla);
}

/**
 * A typed number, taken apart into sign, whole part and fraction.
 *
 * Strict by design. A converter that guessed — reading `1.234,5` as European,
 * skipping a stray letter — would hand back words for a number the reader did
 * not mean, and on a cheque that is the one mistake that matters. Every refusal
 * says which character it stopped at.
 */
export function parseNumber(input: string): ParseResult {
    const chars = [...input];
    let start = 0;
    let end = chars.length;

    while (start < end && /\s/u.test(chars[start])) {
        start++;
    }

    while (end > start && /\s/u.test(chars[end - 1])) {
        end--;
    }

    if (start === end) {
        return { ok: false, reason: "empty" };
    }

    let negative = false;
    let index = start;

    if (chars[index] === "-" || chars[index] === "+" || chars[index] === "−") {
        negative = chars[index] !== "+";
        index++;
    }

    let integer = "";
    let fraction = "";
    let inFraction = false;
    let previousWasDigit = false;

    for (; index < end; index++) {
        const char = chars[index];
        const position = index + 1;
        const digit = digitValue(char);

        if (digit !== null) {
            if (inFraction) {
                fraction += digit;
            } else {
                integer += digit;
            }
            previousWasDigit = true;
            continue;
        }

        if (char === ".") {
            if (inFraction) {
                return { ok: false, reason: "too_many_points", position };
            }
            inFraction = true;
            previousWasDigit = false;
            continue;
        }

        if (GROUP_SEPARATORS.has(char)) {
            const nextIsDigit = index + 1 < end && digitValue(chars[index + 1]) !== null;

            if (inFraction || !previousWasDigit || !nextIsDigit) {
                return { ok: false, reason: "misplaced_separator", position };
            }
            previousWasDigit = false;
            continue;
        }

        if (char === "-" || char === "+" || char === "−") {
            return { ok: false, reason: "misplaced_sign", position };
        }

        return { ok: false, reason: "invalid_character", position };
    }

    if (integer.length === 0 && fraction.length === 0) {
        return { ok: false, reason: "no_digits" };
    }

    const trimmed = integer.replace(/^0+/, "");

    return {
        ok: true,
        value: { negative, integer: trimmed.length === 0 ? "0" : trimmed, fraction },
    };
}
