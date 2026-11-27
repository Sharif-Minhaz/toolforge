import type {
    BajusGrade,
    BajusPrices,
    CurrencyCode,
    Karat,
    PriceBasis,
    PriceSnapshot,
    RateCode,
    ZakatFailure,
    ZakatInput,
} from "../types";
import { parseAmount } from "./amount";
import { GRAMS_PER_TROY_OUNCE, MAX_RESALE_DEDUCTION } from "./constants";
import { compare, div, int, mul, parseExact, ratio, sub, type Exact } from "./exact";

/**
 * Turns what the server read into exact prices in the report currency.
 *
 * **Two prices, on purpose.** The nisab is the market value of 87.48 g of gold
 * or 612.36 g of silver, so it is priced at the undiscounted market price of
 * pure metal (`goldPure`, `silverPure`). A piece you own is worth what it
 * would fetch, so under `bajusResale` it is valued at the BAJUS price less the
 * jeweller's deduction (`itemPerGram`). That is how As-Sunnah Foundation's
 * calculator, advised by IFA Consultancy, does it: holdings at 83% of the BAJUS
 * price, the nisab at the market price of pure silver.
 *
 * Spot is an international price for pure metal, so a piece is its karat's
 * share of it. BAJUS publishes 22, 21 and 18 karat and "traditional"
 * directly; those are used as published. 24 and 14 karat are scaled from 22 by
 * purity, the trade's own way of pricing a karat it does not list, and the pure
 * price under BAJUS is the 22 karat price × 24 / 22 for the same reason.
 *
 * **Traditional (সনাতনী) has no karat.** Its purity is read off the BAJUS
 * prices themselves — 22 × traditional ÷ 22 karat, about 14.7 karat on the day
 * this was written — which is the only published number that describes it.
 * Without BAJUS it cannot be priced or weighed, and the line is refused by name
 * rather than guessed at.
 */

export type PriceTable = {
    readonly currency: CurrencyCode;
    /** Market price of one gram of pure metal: what the nisab is valued at. */
    readonly goldPure: Exact;
    readonly silverPure: Exact;
    /** What one gram of a piece at this karat is worth to its owner, or `null` when it cannot be priced. */
    readonly itemPerGram: (metal: "gold" | "silver", karat: Karat) => Exact | null;
    /** Fraction of a piece that is pure metal, or `null` when it cannot be known. */
    readonly purity: (metal: "gold" | "silver", karat: Karat) => Exact | null;
    /** Converts `amount` held in `code` into the report currency. */
    readonly convert: (amount: Exact, code: RateCode) => Exact | ZakatFailure;
};

const ONE = int(1);

function decimal(text: string | undefined): Exact | null {
    return text === undefined ? null : parseExact(text);
}

/** Units of the report currency per unit of `code`, or a named failure. */
function rateBetween(
    snapshot: PriceSnapshot,
    from: RateCode,
    to: CurrencyCode,
): Exact | ZakatFailure {
    if (from === to) {
        return ONE;
    }

    const perUsd = snapshot.rates?.perUsd;
    const fromRate = decimal(perUsd?.[from]);
    const toRate = decimal(perUsd?.[to]);

    if (fromRate === null || fromRate.n <= 0n) {
        return { ok: false, reason: "missing_rate", code: from };
    }

    if (toRate === null || toRate.n <= 0n) {
        return { ok: false, reason: "missing_rate", code: to };
    }

    return div(toRate, fromRate);
}

export function isFailure<T extends object>(value: T | ZakatFailure): value is ZakatFailure {
    return "ok" in value && value.ok === false;
}

const BAJUS_KARAT: Partial<Record<Karat, BajusGrade>> = {
    22: "k22",
    21: "k21",
    18: "k18",
    traditional: "traditional",
};

/** Karat as a share of 24; `traditional` from the BAJUS prices, or `null` without them. */
function purityFrom(
    bajus: BajusPrices | null,
    metal: "gold" | "silver",
    karat: Karat,
): Exact | null {
    if (karat !== "traditional") {
        return ratio(karat, 24);
    }

    const traditional = decimal(bajus?.[metal].traditional);
    const k22 = decimal(bajus?.[metal].k22);

    return traditional === null || k22 === null || k22.n <= 0n
        ? null
        : mul(div(traditional, k22), ratio(22, 24));
}

/** The jeweller's deduction as a fraction, or `null` when it is not a percentage in range. */
export function readDeduction(text: string): Exact | null {
    const value = parseExact(text.trim().length === 0 ? "0" : text.trim());

    if (value === null || value.n < 0n || compare(value, int(MAX_RESALE_DEDUCTION)) > 0) {
        return null;
    }

    return div(value, int(100));
}

type PricingOptions = {
    readonly custom: { readonly gold: Exact | null; readonly silver: Exact | null };
    /** Fraction off the BAJUS price for `bajusResale`; ignored for every other basis. */
    readonly deduction: Exact | null;
};

export function resolvePrices(
    snapshot: PriceSnapshot,
    basis: PriceBasis,
    currency: CurrencyCode,
    options: PricingOptions,
): PriceTable | ZakatFailure {
    const convert = (amount: Exact, code: RateCode): Exact | ZakatFailure => {
        const rate = rateBetween(snapshot, code, currency);

        return isFailure(rate) ? rate : mul(amount, rate);
    };
    const purity = (metal: "gold" | "silver", karat: Karat) =>
        purityFrom(snapshot.bajus, metal, karat);

    /** Pure-metal pricing: a piece is its purity's share of the pure price. */
    const fromPure = (gold: Exact, silver: Exact): PriceTable => ({
        currency,
        goldPure: gold,
        silverPure: silver,
        itemPerGram: (metal, karat) => {
            const share = purity(metal, karat);

            return share === null ? null : mul(metal === "gold" ? gold : silver, share);
        },
        purity,
        convert,
    });

    if (basis === "custom") {
        const { gold, silver } = options.custom;

        if (gold === null || gold.n <= 0n || silver === null || silver.n <= 0n) {
            return { ok: false, reason: "invalid_custom_price" };
        }

        return fromPure(gold, silver);
    }

    if (basis === "spot") {
        const goldOunce = decimal(snapshot.gold?.usdPerOunce);
        const silverOunce = decimal(snapshot.silver?.usdPerOunce);

        if (goldOunce === null || silverOunce === null) {
            return { ok: false, reason: "missing_metal_price" };
        }

        const ounce = parseExact(GRAMS_PER_TROY_OUNCE) ?? ONE;
        const gold = convert(div(goldOunce, ounce), "USD");
        const silver = convert(div(silverOunce, ounce), "USD");

        if (isFailure(gold)) {
            return gold;
        }

        return isFailure(silver) ? silver : fromPure(gold, silver);
    }

    const bajus = snapshot.bajus;

    if (bajus === null) {
        return { ok: false, reason: "missing_bajus" };
    }

    let factor = ONE;

    if (basis === "bajusResale") {
        if (options.deduction === null) {
            return { ok: false, reason: "invalid_deduction" };
        }

        factor = sub(ONE, options.deduction);
    }

    /** BAJUS BDT per gram for a grade, in the report currency, before any deduction. */
    const market = (metal: "gold" | "silver", grade: BajusGrade): Exact | ZakatFailure => {
        const bdt = decimal(bajus[metal][grade]);

        return bdt === null ? { ok: false, reason: "missing_bajus" } : convert(bdt, "BDT");
    };

    const gold22 = market("gold", "k22");
    const silver22 = market("silver", "k22");

    if (isFailure(gold22)) {
        return gold22;
    }

    if (isFailure(silver22)) {
        return silver22;
    }

    // Every grade converts at the same rate as the 22 karat one just did, so
    // the rest cannot fail once these two have succeeded.
    const toPure = ratio(24, 22);

    return {
        currency,
        goldPure: mul(gold22, toPure),
        silverPure: mul(silver22, toPure),
        itemPerGram: (metal, karat) => {
            const named = BAJUS_KARAT[karat];
            const base = metal === "gold" ? gold22 : silver22;

            if (named !== undefined) {
                const price = market(metal, named);

                return isFailure(price) ? null : mul(price, factor);
            }

            const share = purity(metal, karat);

            return share === null ? null : mul(mul(mul(base, toPure), share), factor);
        },
        purity,
        convert,
    };
}

function positivePrice(text: string): Exact | null {
    const parsed = parseAmount(text);

    return parsed.ok && parsed.value.n > 0n ? parsed.value : null;
}

/**
 * The price table for a set of settings as the form holds them. One function,
 * so the figure, the price list and the nisab card are always priced alike.
 */
export function pricesForSettings(
    snapshot: PriceSnapshot,
    settings: Pick<ZakatInput, "priceBasis" | "currency" | "customPrices" | "resaleDeduction">,
): PriceTable | ZakatFailure {
    return resolvePrices(snapshot, settings.priceBasis, settings.currency, {
        custom: {
            gold: positivePrice(settings.customPrices.gold),
            silver: positivePrice(settings.customPrices.silver),
        },
        deduction: readDeduction(settings.resaleDeduction),
    });
}
