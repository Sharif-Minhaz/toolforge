/**
 * Every address the price feeds are read from, and the limits on reading them.
 * Constants, never built from input — see `repository/prices.ts`.
 */

export const GOLD_API_URLS = {
    gold: ["https://api.gold-api.com/price/XAU"],
    silver: ["https://api.gold-api.com/price/XAG"],
} as const;

/**
 * currency-api (CC0) publishes on two CDNs and asks callers to fall back from
 * one to the other; jsDelivr can hold `@latest` for up to twelve hours, the
 * Pages mirror does not cache at all.
 */
export const FAWAZ_METAL_URLS = {
    gold: [
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.min.json",
        "https://latest.currency-api.pages.dev/v1/currencies/xau.min.json",
    ],
    silver: [
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xag.min.json",
        "https://latest.currency-api.pages.dev/v1/currencies/xag.min.json",
    ],
} as const;

export const FAWAZ_USD_URLS = [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
    "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json",
] as const;

/** Frankfurter v2: blended mid rates, no key, no quota, commercial use allowed. */
export const FRANKFURTER_RATES_URL = "https://api.frankfurter.dev/v2/rates?base=USD";

/** The Bangladesh Jewellers Association's price page; no API is published. */
export const BAJUS_PRICE_URL = "https://www.bajus.org/gold-price";

export const PRICE_FETCH_TIMEOUT_MS = 6000;

/** The BAJUS page is about 30 KB and the largest JSON feed about 20 KB. */
export const MAX_PRICE_RESPONSE_BYTES = 512 * 1024;

/**
 * A spot price outside these bands, in USD per troy ounce, is a broken feed,
 * not a market. Wide on purpose — gold has traded between $250 and $4,000 in
 * living memory — so a real crash or spike still gets through, and only a
 * zero, a misplaced decimal point or a different unit does not.
 */
export const SPOT_BOUNDS_USD_PER_OUNCE = {
    gold: [200, 50_000],
    silver: [2, 2_000],
} as const;
