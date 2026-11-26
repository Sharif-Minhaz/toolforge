import { splitIndian, type IndianScale } from "./indian-scale";

/**
 * Every Bangla number below a hundred has a word of its own. Twenty-one is
 * একুশ, not "বিশ এক"; the units fuse with the tens and change shape doing it,
 * so there is no rule to derive them from and the table is the only honest
 * implementation.
 *
 * Several have two spellings in common use — বিয়াল্লিশ and বেয়াল্লিশ, বায়ান্ন
 * and বাহান্ন. The table was checked entry by entry against the `bn-BD` table
 * in `to-words`, an independent implementation, and agrees with it on all one
 * hundred; see `docs/case-studies/number-to-words.md`.
 */
const BELOW_HUNDRED = [
    "শূন্য",
    "এক",
    "দুই",
    "তিন",
    "চার",
    "পাঁচ",
    "ছয়",
    "সাত",
    "আট",
    "নয়",
    "দশ",
    "এগারো",
    "বারো",
    "তেরো",
    "চৌদ্দ",
    "পনেরো",
    "ষোলো",
    "সতেরো",
    "আঠারো",
    "উনিশ",
    "বিশ",
    "একুশ",
    "বাইশ",
    "তেইশ",
    "চব্বিশ",
    "পঁচিশ",
    "ছাব্বিশ",
    "সাতাশ",
    "আঠাশ",
    "উনত্রিশ",
    "ত্রিশ",
    "একত্রিশ",
    "বত্রিশ",
    "তেত্রিশ",
    "চৌত্রিশ",
    "পঁয়ত্রিশ",
    "ছত্রিশ",
    "সাঁইত্রিশ",
    "আটত্রিশ",
    "উনচল্লিশ",
    "চল্লিশ",
    "একচল্লিশ",
    "বিয়াল্লিশ",
    "তেতাল্লিশ",
    "চুয়াল্লিশ",
    "পঁয়তাল্লিশ",
    "ছেচল্লিশ",
    "সাতচল্লিশ",
    "আটচল্লিশ",
    "উনপঞ্চাশ",
    "পঞ্চাশ",
    "একান্ন",
    "বায়ান্ন",
    "তিপ্পান্ন",
    "চুয়ান্ন",
    "পঞ্চান্ন",
    "ছাপ্পান্ন",
    "সাতান্ন",
    "আটান্ন",
    "উনষাট",
    "ষাট",
    "একষট্টি",
    "বাষট্টি",
    "তেষট্টি",
    "চৌষট্টি",
    "পঁয়ষট্টি",
    "ছেষট্টি",
    "সাতষট্টি",
    "আটষট্টি",
    "উনসত্তর",
    "সত্তর",
    "একাত্তর",
    "বাহাত্তর",
    "তিয়াত্তর",
    "চুয়াত্তর",
    "পঁচাত্তর",
    "ছিয়াত্তর",
    "সাতাত্তর",
    "আটাত্তর",
    "উনআশি",
    "আশি",
    "একাশি",
    "বিরাশি",
    "তিরাশি",
    "চুরাশি",
    "পঁচাশি",
    "ছিয়াশি",
    "সাতাশি",
    "আটাশি",
    "উননব্বই",
    "নব্বই",
    "একানব্বই",
    "বিরানব্বই",
    "তিরানব্বই",
    "চুরানব্বই",
    "পঁচানব্বই",
    "ছিয়ানব্বই",
    "সাতানব্বই",
    "আটানব্বই",
    "নিরানব্বই",
] as const;

/** Exported for the test that checks it against an independent table. */
export const BANGLA_BELOW_HUNDRED: readonly string[] = BELOW_HUNDRED;

/** The rungs of `INDIAN_SCALES` in Bangla. */
const SCALE_NAMES: Readonly<Record<IndianScale, string>> = {
    shankh: "শঙ্খ",
    padma: "পদ্ম",
    neel: "নীল",
    kharab: "খরব",
    arab: "আরব",
    crore: "কোটি",
    lakh: "লক্ষ",
    thousand: "হাজার",
};

/**
 * The written register, the one a cheque, a deed or a form uses: শত rather
 * than the spoken শো, লক্ষ rather than লাখ. "এক শত" keeps its এক, as formal
 * Bangla writes it.
 */
export const BANGLA_WORDS = {
    hundred: "শত",
    minus: "ঋণাত্মক",
    point: "দশমিক",
    only: "মাত্র",
} as const;

function belowThousand(value: number): string {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    const parts: string[] = [];

    if (hundreds > 0) {
        parts.push(`${BELOW_HUNDRED[hundreds]} ${BANGLA_WORDS.hundred}`);
    }

    if (rest > 0) {
        parts.push(BELOW_HUNDRED[rest]);
    }

    return parts.join(" ");
}

/**
 * হাজার, লক্ষ, কোটি, then আরব খরব নীল পদ্ম শঙ্খ, each a hundred times the last.
 * A count of শঙ্খ is spelled recursively: ১০¹⁹ is এক শত শঙ্খ.
 */
function inIndian(value: bigint): string {
    return splitIndian(value)
        .map(({ count, scale }) => {
            if (scale === null) {
                return belowThousand(Number(count));
            }

            const amount = count < 100n ? BELOW_HUNDRED[Number(count)] : inIndian(count);

            return `${amount} ${SCALE_NAMES[scale]}`;
        })
        .join(" ");
}

/** A whole number in Bangla words. Bangla counts on the South Asian ladder only. */
export function banglaInteger(digits: string): string {
    const value = BigInt(digits);

    return value === 0n ? BELOW_HUNDRED[0] : inIndian(value);
}

/** Digits after the point, one at a time: "দশমিক এক চার". */
export function banglaDigits(digits: string): string {
    return [...digits].map((digit) => BELOW_HUNDRED[Number(digit)]).join(" ");
}

/** Below a hundred is the only range a minor unit can land in. */
export function banglaBelowHundred(value: number): string {
    return BELOW_HUNDRED[value];
}
