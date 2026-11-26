import type { Currency, CurrencyNames, NumberWordsOptions } from "../types";

/**
 * The longest whole part the English line can name: thirty-four groups of
 * three, up to 999 duotrigintillion — past a googol, and the end of the short
 * scale's names in common reference. The South Asian ladder nests shankhs and
 * has no ceiling of its own, but both lines stop at the same place.
 */
export const MAX_INTEGER_DIGITS = 102;

/** Past this a decimal is a measurement nobody reads digit by digit. */
export const MAX_FRACTION_DIGITS = 12;

/** Every currency here divides into a hundred, so an amount has two decimals at most. */
export const CURRENCY_FRACTION_DIGITS = 2;

/**
 * The box takes a number, not a document. Room for the longest whole part, its
 * grouping commas, a sign and a fraction; anything longer is a paste gone wrong.
 */
export const MAX_NUMBER_INPUT_LENGTH = 200;

export const DEFAULT_NUMBER_WORDS_OPTIONS: NumberWordsOptions = {
    format: "cardinal",
    currency: "bdt",
    // Millions and billions by default: it is what an English reader expects
    // to see, while the Bangla line beside it counts in লক্ষ and কোটি anyway.
    // A cheque written in lakhs and crores is one switch away.
    scale: "international",
    letterCase: "lower",
    britishAnd: false,
    appendOnly: true,
};

/**
 * Unit names, as output rather than as copy: the English line says "taka"
 * whichever language the page is in, and the Bangla line says টাকা. They are
 * the words the tool writes, not the words it is labelled with, so they live
 * here and not in the message catalogue.
 */
export const CURRENCY_NAMES: Readonly<
    Record<Currency, { readonly en: CurrencyNames; readonly bn: CurrencyNames }>
> = {
    bdt: {
        en: { major: "taka", majorPlural: "taka", minor: "paisa", minorPlural: "paisa" },
        bn: { major: "টাকা", majorPlural: "টাকা", minor: "পয়সা", minorPlural: "পয়সা" },
    },
    inr: {
        en: { major: "rupee", majorPlural: "rupees", minor: "paisa", minorPlural: "paise" },
        bn: { major: "রুপি", majorPlural: "রুপি", minor: "পয়সা", minorPlural: "পয়সা" },
    },
    usd: {
        en: { major: "dollar", majorPlural: "dollars", minor: "cent", minorPlural: "cents" },
        bn: { major: "ডলার", majorPlural: "ডলার", minor: "সেন্ট", minorPlural: "সেন্ট" },
    },
    eur: {
        en: { major: "euro", majorPlural: "euros", minor: "cent", minorPlural: "cents" },
        bn: { major: "ইউরো", majorPlural: "ইউরো", minor: "সেন্ট", minorPlural: "সেন্ট" },
    },
    gbp: {
        en: { major: "pound", majorPlural: "pounds", minor: "penny", minorPlural: "pence" },
        bn: { major: "পাউন্ড", majorPlural: "পাউন্ড", minor: "পেনি", minorPlural: "পেনি" },
    },
};

/** ISO codes and symbols are data, the same in either locale. */
export const CURRENCY_LABELS: Readonly<Record<Currency, string>> = {
    bdt: "BDT · ৳",
    inr: "INR · ₹",
    usd: "USD · $",
    eur: "EUR · €",
    gbp: "GBP · £",
};
