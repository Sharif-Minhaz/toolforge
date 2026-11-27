import { DEFAULT_RULES } from "@/modules/zakat/domain/rules";
import type {
    CurrencyCode,
    MetalItem,
    MoneyKind,
    MoneyLine,
    PriceSnapshot,
    ZakatInput,
    ZakatOutcome,
    ZakatResult,
    ZakatRules,
} from "@/modules/zakat/types";

/**
 * Prices chosen so every expected figure can be checked by hand: gold at
 * exactly $100 a gram (3110.34768 an ounce), silver at $1 a gram, 120 taka to
 * the dollar, one bitcoin at $100,000.
 */
export const SNAPSHOT: PriceSnapshot = {
    gold: { usdPerOunce: "3110.34768", asOf: "2026-11-27T04:00:00Z", source: "gold-api" },
    silver: { usdPerOunce: "31.1034768", asOf: "2026-11-27T04:00:00Z", source: "gold-api" },
    rates: {
        perUsd: { USD: "1", BDT: "120", SAR: "3.75", BTC: "0.00001" },
        asOf: "2026-11-27T12:00:00Z",
        source: "frankfurter",
    },
    bajus: {
        gold: { k22: "15000", k21: "14000", k18: "12000", traditional: "10000" },
        silver: { k22: "220", k21: "210", k18: "180", traditional: "150" },
        effectiveDate: "2026-11-27",
    },
};

let counter = 0;
const nextId = () => `line-${(counter += 1)}`;

export function money(kind: MoneyKind, amount: string, currency: CurrencyCode = "BDT"): MoneyLine {
    return { id: nextId(), kind, label: "", amount, currency };
}

export function gold(weight: string, options: Partial<MetalItem> = {}): MetalItem {
    return {
        id: nextId(),
        metal: "gold",
        label: "",
        weight,
        unit: "gram",
        karat: 24,
        use: "savings",
        ...options,
    };
}

type InputOverrides = Partial<Omit<ZakatInput, "rules">> & { rules?: Partial<ZakatRules> };

export function input(overrides: InputOverrides = {}): ZakatInput {
    const { rules, ...rest } = overrides;

    return {
        currency: "BDT",
        priceBasis: "spot",
        customPrices: { gold: "", silver: "" },
        resaleDeduction: "17",
        isMinor: false,
        money: [],
        metals: [],
        crypto: [],
        longTermShares: { value: "", currency: "BDT", method: "full", ratioPercent: "" },
        ...rest,
        rules: { ...DEFAULT_RULES, ...rules },
    };
}

export function expectResult(outcome: ZakatOutcome): ZakatResult {
    if (!outcome.ok) {
        throw new Error(`expected a result, got ${outcome.reason}`);
    }

    return outcome;
}
