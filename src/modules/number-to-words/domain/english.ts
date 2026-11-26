import type { EnglishScale } from "../types";
import { splitIndian, type IndianScale } from "./indian-scale";

const ONES = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
] as const;

const TENS = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
] as const;

/**
 * The short scale, which every English-speaking country now uses. Index is
 * the power of 1,000, up to duotrigintillion (10⁹⁹) — the last name before a
 * googol, and where `MAX_INTEGER_DIGITS` stops.
 */
const THOUSANDS_SCALE = [
    "",
    "thousand",
    "million",
    "billion",
    "trillion",
    "quadrillion",
    "quintillion",
    "sextillion",
    "septillion",
    "octillion",
    "nonillion",
    "decillion",
    "undecillion",
    "duodecillion",
    "tredecillion",
    "quattuordecillion",
    "quindecillion",
    "sexdecillion",
    "septendecillion",
    "octodecillion",
    "novemdecillion",
    "vigintillion",
    "unvigintillion",
    "duovigintillion",
    "trevigintillion",
    "quattuorvigintillion",
    "quinvigintillion",
    "sexvigintillion",
    "septenvigintillion",
    "octovigintillion",
    "novemvigintillion",
    "trigintillion",
    "untrigintillion",
    "duotrigintillion",
] as const;

/**
 * 10¹⁰⁰ has a name of its own. Exactly that number reads as "one googol"; a
 * googol and one is ten duotrigintillion and one, because "googol" is a name
 * for one number rather than a rung on a scale.
 */
const GOOGOL = 10n ** 100n;

/** The South Asian rungs, as Indian English writes them. */
const INDIAN_NAMES: Readonly<Record<IndianScale, string>> = {
    shankh: "shankh",
    padma: "padma",
    neel: "neel",
    kharab: "kharab",
    arab: "arab",
    crore: "crore",
    lakh: "lakh",
    thousand: "thousand",
};

type EnglishStyle = {
    readonly scale: EnglishScale;
    readonly britishAnd: boolean;
};

function belowHundred(value: number): string {
    if (value < 20) {
        return ONES[value];
    }

    const unit = value % 10;
    const tens = TENS[Math.floor(value / 10)];

    return unit === 0 ? tens : `${tens}-${ONES[unit]}`;
}

function belowThousand(value: number, britishAnd: boolean): string {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;

    if (hundreds === 0) {
        return belowHundred(rest);
    }

    if (rest === 0) {
        return `${ONES[hundreds]} hundred`;
    }

    return `${ONES[hundreds]} hundred${britishAnd ? " and" : ""} ${belowHundred(rest)}`;
}

/**
 * The British "and" before a last group under a hundred: "one thousand and
 * five", "two million and one". Inside a group it is handled by
 * `belowThousand`.
 */
function joinGroups(parts: readonly string[], lastGroup: number, britishAnd: boolean): string {
    if (britishAnd && parts.length > 1 && lastGroup > 0 && lastGroup < 100) {
        return `${parts.slice(0, -1).join(" ")} and ${parts.at(-1)}`;
    }

    return parts.join(" ");
}

function inThousands(value: bigint, britishAnd: boolean): string {
    const groups: number[] = [];
    let rest = value;

    while (rest > 0n) {
        groups.push(Number(rest % 1000n));
        rest /= 1000n;
    }

    const parts: string[] = [];

    for (let power = groups.length - 1; power >= 0; power--) {
        const group = groups[power];

        if (group === 0) {
            continue;
        }

        const words = belowThousand(group, britishAnd);
        parts.push(power === 0 ? words : `${words} ${THOUSANDS_SCALE[power]}`);
    }

    return joinGroups(parts, groups[0], britishAnd);
}

/**
 * Lakhs, crores and the rungs above them. Every rung but shankh holds fewer
 * than a hundred; a count of shankhs is spelled recursively.
 */
function inIndian(value: bigint, britishAnd: boolean): string {
    const parts = splitIndian(value).map(({ count, scale }) => {
        if (scale === null) {
            return belowThousand(Number(count), britishAnd);
        }

        const amount = count < 100n ? belowHundred(Number(count)) : inIndian(count, britishAnd);

        return `${amount} ${INDIAN_NAMES[scale]}`;
    });

    return joinGroups(parts, Number(value % 1000n), britishAnd);
}

/** A whole number in English words, lower case, hyphenated the usual way. */
export function englishInteger(digits: string, style: EnglishStyle): string {
    const value = BigInt(digits);

    if (value === 0n) {
        return ONES[0];
    }

    if (style.scale === "south-asian") {
        return inIndian(value, style.britishAnd);
    }

    return value === GOOGOL ? "one googol" : inThousands(value, style.britishAnd);
}

/** Digits after the point, read one at a time: "point one four". */
export function englishDigits(digits: string): string {
    return [...digits].map((digit) => ONES[Number(digit)]).join(" ");
}

export const ENGLISH_WORDS = {
    minus: "minus",
    point: "point",
    and: "and",
    only: "only",
} as const;
