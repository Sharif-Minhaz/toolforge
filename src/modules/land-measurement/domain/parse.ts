import { westernDigit } from "@/modules/tools/domain/bangla-digits";

import type { NumberParseResult } from "../types";

/** Characters people put between digit groups: comma, space, and the spaces a word processor substitutes. */
const GROUP_SEPARATORS = new Set([",", " ", "_", " ", " ", " ", "٬"]);

/**
 * A typed area, read as a number. Western or Bangla digits, one decimal point,
 * and separators only between two digits of the whole part.
 *
 * Strict for the same reason a cheque converter is: reading `1.234,5` as
 * European or skipping a stray letter would convert an area nobody typed, and
 * the figure goes on to price a plot of land. A minus sign is refused by name,
 * because "negative land" is a mistake worth saying out loud.
 */
export function parseArea(input: string): NumberParseResult {
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

    let index = start;

    if (chars[index] === "-" || chars[index] === "−") {
        return { ok: false, reason: "negative", position: index + 1 };
    }

    if (chars[index] === "+") {
        index++;
    }

    let integer = "";
    let fraction = "";
    let inFraction = false;
    let previousWasDigit = false;

    for (; index < end; index++) {
        const char = chars[index];
        const position = index + 1;
        const digit = westernDigit(char);

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
            const nextIsDigit = index + 1 < end && westernDigit(chars[index + 1]) !== null;

            if (inFraction || !previousWasDigit || !nextIsDigit) {
                return { ok: false, reason: "misplaced_separator", position };
            }
            previousWasDigit = false;
            continue;
        }

        return { ok: false, reason: "invalid_character", position };
    }

    if (integer.length === 0 && fraction.length === 0) {
        return { ok: false, reason: "no_digits" };
    }

    return { ok: true, value: Number(`${integer || "0"}.${fraction || "0"}`) };
}
