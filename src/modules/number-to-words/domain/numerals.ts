import type { EnglishScale, ParsedNumber } from "../types";

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

/** `1234567` → `1,234,567`. */
function groupInThousands(digits: string): string {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** `1234567` → `12,34,567`: the last three, then pairs. */
function groupInLakhs(digits: string): string {
    if (digits.length <= 3) {
        return digits;
    }

    const head = digits.slice(0, -3);
    const tail = digits.slice(-3);

    return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

export function toBanglaDigits(text: string): string {
    return text.replace(/\d/g, (digit) => BANGLA_DIGITS[Number(digit)]);
}

/**
 * The number written back out, grouped for reading. Done by hand rather than
 * with `Intl.NumberFormat`, which takes a JavaScript number and so cannot hold
 * the hundred and two digits the words go up to — and would round them silently.
 */
export function formatNumeral(
    value: ParsedNumber,
    scale: EnglishScale,
    fractionDigits?: number,
): string {
    const grouped =
        scale === "international" ? groupInThousands(value.integer) : groupInLakhs(value.integer);
    const fraction =
        fractionDigits === undefined ? value.fraction : value.fraction.padEnd(fractionDigits, "0");
    const sign = value.negative && !isZero(value) ? "-" : "";

    return fraction.length > 0 ? `${sign}${grouped}.${fraction}` : `${sign}${grouped}`;
}

export function isZero(value: ParsedNumber): boolean {
    return value.integer === "0" && /^0*$/.test(value.fraction);
}
