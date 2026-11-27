import type { CurrencyCode, NisabStandard, PriceBasis, WeightUnit } from "../types";

/**
 * Every figure the calculation rests on, each a decimal string so it enters
 * the arithmetic exactly. Sources are in `docs/case-studies/zakat.md`.
 */

/** One troy ounce, in grams — the unit every spot feed quotes in. Exact by definition. */
export const GRAMS_PER_TROY_OUNCE = "31.1034768";

/**
 * One vori (bhori) = one tola, in grams, as Bangladeshi jewellers and BAJUS
 * use it. The 1833 tola is 11.6638038 g; the trade rounds it to 11.664, and the
 * 87.48 g / 612.36 g nisab figures are exactly 7.5 and 52.5 of these.
 */
export const GRAMS_PER_VORI = "11.664";

/** 1 vori = 16 ana = 96 rati = 960 point. */
export const ANA_PER_VORI = 16;
export const RATI_PER_ANA = 6;
export const POINT_PER_RATI = 10;

export const GRAMS_PER_UNIT: Readonly<Record<WeightUnit, string>> = {
    gram: "1",
    vori: GRAMS_PER_VORI,
    // 11.664 / 16 and / 96, written out exactly.
    ana: "0.729",
    rati: "0.1215",
    ounce: GRAMS_PER_TROY_OUNCE,
};

/** Nisab in grams of pure metal, for each standard. */
export const NISAB_GRAMS: Readonly<Record<NisabStandard, { gold: string; silver: string }>> = {
    tola: { gold: "87.48", silver: "612.36" },
    grams: { gold: "85", silver: "595" },
};

/** The lunar-year rate, one fortieth. */
export const LUNAR_RATE = { n: 1, d: 40 } as const;

/**
 * The solar-year rate: 2.5% × 365 / 354, so that a Gregorian year pays what a
 * Hijri year of the same wealth would (AAOIFI SS-35, Dar al-Ifta Egypt 8124).
 * Kept as the fraction 73 / 2832 — 2.5776836…% — and never rounded to 2.577.
 */
export const SOLAR_RATE = { n: 73, d: 2832 } as const;

/**
 * The solar-year rate rounded up to 2.6%, as As-Sunnah Foundation's calculator
 * and several Bangladeshi bodies use it: a few paisa more than 2.5776…% on
 * every hundred, kept as a precaution in favour of the recipients.
 */
export const SOLAR_ROUNDED_RATE = { n: 13, d: 500 } as const;

/**
 * Under the full-weight reading, an alloy counts as gold when gold is the
 * greater part of it — 12 karat and above. Below that only its gold content
 * is counted, whatever the method.
 */
export const MAJORITY_KARAT = 12;

/**
 * What a jeweller takes off the BAJUS price when buying a piece back, in
 * percent. 17 — a sale value of 83% — is what As-Sunnah Foundation's
 * calculator (advised by IFA Consultancy) uses. BAJUS's own notice deducts 15%
 * after making charges and stones are removed; the reader can set either, or
 * their own jeweller's figure.
 */
export const DEFAULT_RESALE_DEDUCTION = "17";

/** A deduction above this is a typo, not a jeweller. */
export const MAX_RESALE_DEDUCTION = 50;

/** NZF's proxy for the zakatable share of a long-term equity holding. */
export const SHARE_PROXY = "0.25";

/** Minor-unit digits, so a payable is rounded up to a real coin. */
export const MINOR_DIGITS: Readonly<Record<CurrencyCode, number>> = {
    BDT: 2,
    USD: 2,
    GBP: 2,
    EUR: 2,
    SAR: 2,
    AED: 2,
    QAR: 2,
    KWD: 3,
    OMR: 3,
    BHD: 3,
    MYR: 2,
    IDR: 2,
    SGD: 2,
    BND: 2,
    INR: 2,
    PKR: 2,
    LKR: 2,
    NPR: 2,
    TRY: 2,
    EGP: 2,
    MAD: 2,
    NGN: 2,
    KES: 2,
    ZAR: 2,
    CAD: 2,
    AUD: 2,
    NZD: 2,
    JPY: 0,
    CNY: 2,
    HKD: 2,
    CHF: 2,
    SEK: 2,
    NOK: 2,
    DKK: 2,
};

/** Digits kept on every intermediate figure handed to the UI. Far below any coin. */
export const WORKING_DIGITS = 6;

/**
 * The largest amount one field may hold: a hundred trillion. Past it the
 * number is a typo, and a figure that size would not fit a sentence.
 */
export const MAX_AMOUNT = "100000000000000";

/** Characters an amount field accepts before it is refused rather than parsed. */
export const MAX_AMOUNT_LENGTH = 24;

/** Rows each list may hold. */
export const MAX_METAL_ITEMS = 40;
export const MAX_CRYPTO_LINES = 20;
export const MAX_MONEY_LINES = 120;

/** Short labels on a line. */
export const MAX_LABEL_LENGTH = 60;

export const DEFAULT_CURRENCY: CurrencyCode = "BDT";

export const DEFAULT_PRICE_BASIS: PriceBasis = "bajusResale";
