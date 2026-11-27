import { parse } from "node-html-parser";

import type {
    BajusGrade,
    BajusPrices,
    RateCode,
    MetalQuote,
    MetalSource,
    RateTable,
} from "../types";
import { CRYPTO_CODES, CURRENCY_CODES } from "../types";
import {
    goldApiResponseSchema,
    fawazMetalResponseSchema,
    fawazUsdResponseSchema,
    frankfurterResponseSchema,
} from "../validation/upstream";
import { SPOT_BOUNDS_USD_PER_OUNCE } from "./price-sources";
import { fromNumber, parseExact, toDecimal, toPlainDecimal } from "./exact";

/**
 * Reading the price feeds, as pure functions over what they sent.
 *
 * Every feed is treated as untrusted: shape-checked with Zod, and a price
 * outside a broad plausible band (`SPOT_BOUNDS_USD_PER_OUNCE`) is refused rather
 * than passed on. A zakat figure built on a feed that briefly reported gold at
 * zero would tell somebody they owe nothing, and they would believe it.
 *
 * Prices leave here as decimal strings, not floats and not fractions: they
 * cross from the server to the browser as props, and a string is the one form
 * that survives that trip exactly.
 */

function withinBounds(metal: "gold" | "silver", usdPerOunce: number): boolean {
    const [low, high] = SPOT_BOUNDS_USD_PER_OUNCE[metal];

    return usdPerOunce >= low && usdPerOunce <= high;
}

function quote(
    metal: "gold" | "silver",
    usdPerOunce: number,
    asOf: string,
    source: MetalSource,
): MetalQuote | null {
    const exact = fromNumber(usdPerOunce);

    if (exact === null || !withinBounds(metal, usdPerOunce)) {
        return null;
    }

    return { usdPerOunce: toPlainDecimal(exact), asOf, source };
}

/** `api.gold-api.com/price/XAU` — a live spot price in USD per troy ounce. */
export function readGoldApi(metal: "gold" | "silver", body: unknown): MetalQuote | null {
    const parsed = goldApiResponseSchema.safeParse(body);

    if (!parsed.success || parsed.data.currency !== "USD") {
        return null;
    }

    const symbol = metal === "gold" ? "XAU" : "XAG";

    return parsed.data.symbol === symbol
        ? quote(metal, parsed.data.price, parsed.data.updatedAt, "gold-api")
        : null;
}

/**
 * `currency-api` `/currencies/xau.json` — yesterday's fix, as USD per ounce
 * under `xau.usd`. The fallback when the live feed is down, and labelled as a
 * daily price wherever it is shown.
 */
export function readFawazMetal(metal: "gold" | "silver", body: unknown): MetalQuote | null {
    const parsed = fawazMetalResponseSchema.safeParse(body);

    if (!parsed.success) {
        return null;
    }

    const usd = metal === "gold" ? parsed.data.xau?.usd : parsed.data.xag?.usd;

    // The feed's `date` is a calendar day with no zone; noon UTC names that
    // day in every zone a reader is likely to be in.
    return usd === undefined
        ? null
        : quote(metal, usd, `${parsed.data.date}T12:00:00Z`, "currency-api");
}

const RATE_CODES: ReadonlySet<string> = new Set([...CURRENCY_CODES, ...CRYPTO_CODES]);

function isRateCode(code: string): code is RateCode {
    return RATE_CODES.has(code);
}

/** Units of each supported currency per US dollar, from the rows a feed sent. */
function rateTable(rows: readonly (readonly [string, number])[]): RateTable["perUsd"] {
    const table: Partial<Record<RateCode, string>> = { USD: "1" };

    for (const [code, rate] of rows) {
        const exact = fromNumber(rate);

        if (isRateCode(code) && exact !== null && rate > 0) {
            table[code] = toPlainDecimal(exact);
        }
    }

    return table;
}

/** Frankfurter v2 `/v2/rates?base=USD` — an array of `{ quote, rate, date }`. */
export function readFrankfurter(body: unknown): RateTable | null {
    const parsed = frankfurterResponseSchema.safeParse(body);

    if (!parsed.success || parsed.data.length === 0) {
        return null;
    }

    const rows = parsed.data
        .filter((row) => row.base === "USD")
        .map((row) => [row.quote, row.rate] as const);
    const dates = parsed.data.map((row) => row.date).sort();

    return {
        perUsd: rateTable(rows),
        asOf: `${dates.at(-1)}T12:00:00Z`,
        source: "frankfurter",
    };
}

/** `currency-api` `/currencies/usd.json` — lower-case codes under `usd`. */
export function readFawazRates(body: unknown): RateTable | null {
    const parsed = fawazUsdResponseSchema.safeParse(body);

    if (!parsed.success) {
        return null;
    }

    const rows = Object.entries(parsed.data.usd).map(
        ([code, rate]) => [code.toUpperCase(), rate] as const,
    );

    return {
        perUsd: rateTable(rows),
        asOf: `${parsed.data.date}T12:00:00Z`,
        source: "currency-api",
    };
}

const BAJUS_PRODUCT = /^(?:(22|21|18)\s*KARAT|(TRADITIONAL))\s+(GOLD|SILVER)$/i;

const BAJUS_PRICE = /^([\d,]+(?:\.\d+)?)\s*BDT\s*\/\s*GRAM$/i;

/** `27-Nov-2026.pdf` in the "View In PDF" link is the only date on the page. */
const BAJUS_DATE = /(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})\.pdf/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const KARAT_GRADES: Readonly<Record<string, BajusGrade>> = {
    "22": "k22",
    "21": "k21",
    "18": "k18",
};

type GradeTable = Partial<Record<BajusGrade, string>>;

function completeTable(side: GradeTable): Record<BajusGrade, string> | null {
    const { k22, k21, k18, traditional } = side;

    return k22 === undefined || k21 === undefined || k18 === undefined || traditional === undefined
        ? null
        : { k22, k21, k18, traditional };
}

function noticeDate(html: string): string | null {
    const link = html.match(/[^"']*\.pdf/i)?.[0] ?? "";
    let decoded = link;

    try {
        decoded = decodeURIComponent(link);
    } catch {
        // A malformed escape: read the link as it stands.
    }

    const dated = BAJUS_DATE.exec(decoded);

    if (dated === null) {
        return null;
    }

    const month = String(MONTHS.indexOf(dated[2].toLowerCase()) + 1).padStart(2, "0");

    return `${dated[3]}-${month}-${dated[1].padStart(2, "0")}`;
}

/**
 * The Bangladesh Jewellers Association's published retail prices, read off its
 * price page: BDT per gram for 22, 21 and 18 karat and "traditional", for gold
 * and for silver.
 *
 * An HTML page, not an API, so this is deliberately strict: every one of the
 * eight prices must be found and plausible, or the whole reading is `null` and
 * the tool falls back to spot. Half a table read from a changed page is worse
 * than none.
 */
export function readBajus(html: string): BajusPrices | null {
    const root = parse(html);
    const prices: { gold: GradeTable; silver: GradeTable } = { gold: {}, silver: {} };

    for (const row of root.querySelectorAll("table.gold-table tr, table.silver-table tr")) {
        const product = row.querySelector("h6")?.text.replace(/\s+/g, " ").trim() ?? "";
        const priceText = row.querySelector("span.price")?.text.trim() ?? "";
        const match = BAJUS_PRODUCT.exec(product);
        const number = BAJUS_PRICE.exec(priceText);

        if (match === null || number === null) {
            continue;
        }

        const grade = match[2] === undefined ? KARAT_GRADES[match[1]] : "traditional";
        const metal = match[3].toLowerCase() === "gold" ? "gold" : "silver";
        const value = parseExact(number[1].replaceAll(",", ""));

        if (grade !== undefined && value !== null && value.n > 0n) {
            prices[metal][grade] = toDecimal(value, 2);
        }
    }

    const gold = completeTable(prices.gold);
    const silver = completeTable(prices.silver);

    return gold === null || silver === null
        ? null
        : { gold, silver, effectiveDate: noticeDate(html) };
}
