import { westernDigit } from "@/modules/tools/domain/bangla-digits";

import { MAX_AMOUNT, MAX_AMOUNT_LENGTH } from "./constants";
import { compare, parseExact, ZERO, type Exact } from "./exact";

/**
 * An amount as somebody types it: `1,50,000` in Bangladesh's lakh grouping,
 * `150,000.50` in the international one, `১৫০০০০` on a Bangla keyboard, or
 * with spaces between the groups. Commas, spaces and underscores are group
 * separators and are dropped; a single `.` is the decimal point. Anything else
 * — a minus sign, a letter, a second point, exponent notation — is refused
 * rather than guessed at, because a wrong guess is a wrong zakat.
 */

export type AmountParse =
    | { readonly ok: true; readonly value: Exact }
    | { readonly ok: false; readonly reason: "invalid_amount" | "too_large" };

const LIMIT = parseExact(MAX_AMOUNT) ?? ZERO;

/** Comma, space, no-break space, narrow no-break space (what `Intl` groups with), underscore. */
const GROUP_SEPARATORS: ReadonlySet<string> = new Set([",", " ", "\u00A0", "\u202F", "_"]);

export function parseAmount(text: string): AmountParse {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
        return { ok: true, value: ZERO };
    }

    if (trimmed.length > MAX_AMOUNT_LENGTH) {
        return { ok: false, reason: "too_large" };
    }

    let normalised = "";

    for (const char of trimmed) {
        const digit = westernDigit(char);

        if (digit !== null) {
            normalised += digit;
        } else if (char === ".") {
            normalised += ".";
        } else if (!GROUP_SEPARATORS.has(char)) {
            // Anything else — a minus, a letter, the Bangla full stop "।" —
            // is refused rather than guessed at.
            return { ok: false, reason: "invalid_amount" };
        }
    }

    const value = parseExact(normalised.startsWith(".") ? `0${normalised}` : normalised);

    if (value === null) {
        return { ok: false, reason: "invalid_amount" };
    }

    return compare(value, LIMIT) > 0 ? { ok: false, reason: "too_large" } : { ok: true, value };
}
