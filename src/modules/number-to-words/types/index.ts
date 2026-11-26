/**
 * What the number is being read as. A cardinal is the number itself, decimals
 * and all; a currency amount is the same number written the way a cheque or an
 * invoice needs it, with the unit names and the minor unit spelled out.
 */
export const NUMBER_FORMATS = ["cardinal", "currency"] as const;

export type NumberFormat = (typeof NUMBER_FORMATS)[number];

/**
 * How English groups the digits. `international` counts in thousands —
 * million, billion, trillion. `south-asian` counts the way Bangladesh, India
 * and Pakistan do — thousand, lakh, crore — which is what an English-language
 * cheque in Dhaka is written in. Bangla has only the one system.
 */
export const ENGLISH_SCALES = ["international", "south-asian"] as const;

export type EnglishScale = (typeof ENGLISH_SCALES)[number];

/** Bangla has no letter case; these shape the English line only. */
export const LETTER_CASES = ["lower", "sentence", "title", "upper"] as const;

export type LetterCase = (typeof LETTER_CASES)[number];

export const CURRENCIES = ["bdt", "inr", "usd", "eur", "gbp"] as const;

export type Currency = (typeof CURRENCIES)[number];

export type NumberWordsOptions = {
    readonly format: NumberFormat;
    /** Only read when `format` is `currency`. */
    readonly currency: Currency;
    readonly scale: EnglishScale;
    readonly letterCase: LetterCase;
    /** "one hundred and five", the British way, rather than "one hundred five". */
    readonly britishAnd: boolean;
    /** Ends a currency amount with "only" / "মাত্র", as a cheque must. */
    readonly appendOnly: boolean;
};

/** A number as it was typed, taken apart and checked. Digits only, no signs. */
export type ParsedNumber = {
    readonly negative: boolean;
    /** No leading zeros; `"0"` for zero. */
    readonly integer: string;
    /** Exactly as typed after the point, trailing zeros included. */
    readonly fraction: string;
};

export type NumberWordsFailureReason =
    | "empty"
    | "invalid_character"
    | "misplaced_sign"
    | "misplaced_separator"
    | "too_many_points"
    | "no_digits"
    | "too_many_digits"
    | "too_many_decimals"
    | "negative_amount";

export type NumberWordsFailure = {
    readonly ok: false;
    readonly reason: NumberWordsFailureReason;
    /** 1-based character the problem was found at, where one can be pointed to. */
    readonly position?: number;
};

export type NumberWordsSuccess = {
    readonly ok: true;
    readonly english: string;
    readonly bangla: string;
    /** The number regrouped for reading: `12,34,567.5` or `1,234,567.5`. */
    readonly numeral: string;
    /** The same in Bangla digits, always grouped in lakhs and crores. */
    readonly banglaNumeral: string;
};

export type NumberWordsResult = NumberWordsSuccess | NumberWordsFailure;

export type ParseResult = { readonly ok: true; readonly value: ParsedNumber } | NumberWordsFailure;

/** One currency's unit names in one language. */
export type CurrencyNames = {
    readonly major: string;
    readonly majorPlural: string;
    readonly minor: string;
    readonly minorPlural: string;
};
