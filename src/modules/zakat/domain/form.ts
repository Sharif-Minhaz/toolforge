import type {
    AdjustmentKind,
    AssetKind,
    CryptoLine,
    CurrencyCode,
    LiabilityKind,
    MetalItem,
    MoneyKind,
    MoneyLine,
    PriceBasis,
    PriceSnapshot,
    ShareMethod,
    ZakatInput,
    ZakatRules,
} from "../types";
import { DEFAULT_CURRENCY, DEFAULT_RESALE_DEDUCTION } from "./constants";
import { DEFAULT_RULES } from "./rules";

/**
 * What the page holds while somebody fills it in, and how it becomes a
 * `ZakatInput`. One amount per money kind, each in its own currency — the
 * expatriate case, a taka account beside a riyal one, is the reason the
 * currency is per field rather than per page.
 */

/** The sections of the form, in the order they are shown. */
export const MONEY_SECTIONS = {
    cash: ["cash", "bank", "mobileWallet", "foreignCash"],
    savings: [
        "fixedDeposit",
        "savingsCertificate",
        "providentVoluntary",
        "insurancePremiums",
        "tradingShares",
        "mutualFunds",
    ],
    business: ["businessCash", "inventory", "businessReceivables", "partnershipShare"],
    owed: [
        "loansGiven",
        "depositsWithOthers",
        "securityDeposits",
        "resaleProperty",
        "rentHeld",
        "otherAssets",
    ],
    liabilities: [
        "debtsDueNow",
        "billsDue",
        "wagesDue",
        "taxDue",
        "pastZakatDue",
        "instalmentsYear",
        "businessLoanYear",
        "mahrDue",
        "longTermRemaining",
    ],
    adjustments: ["interestHeld", "advancePaid"],
} as const satisfies {
    readonly cash: readonly AssetKind[];
    readonly savings: readonly AssetKind[];
    readonly business: readonly AssetKind[];
    readonly owed: readonly AssetKind[];
    readonly liabilities: readonly LiabilityKind[];
    readonly adjustments: readonly AdjustmentKind[];
};

export type MoneySection = keyof typeof MONEY_SECTIONS;

export const MONEY_SECTION_ORDER = [
    "cash",
    "savings",
    "business",
    "owed",
    "liabilities",
    "adjustments",
] as const satisfies readonly MoneySection[];

export type MoneyField = { readonly amount: string; readonly currency: CurrencyCode };

export type ZakatForm = {
    readonly currency: CurrencyCode;
    readonly rules: ZakatRules;
    readonly priceBasis: PriceBasis;
    readonly customPrices: { readonly gold: string; readonly silver: string };
    /** Percent, as typed; see `ZakatInput.resaleDeduction`. */
    readonly resaleDeduction: string;
    readonly isMinor: boolean;
    readonly money: Readonly<Partial<Record<MoneyKind, MoneyField>>>;
    readonly metals: readonly MetalItem[];
    readonly crypto: readonly CryptoLine[];
    readonly longTermShares: {
        readonly value: string;
        readonly currency: CurrencyCode;
        readonly method: ShareMethod;
        readonly ratioPercent: string;
    };
};

/** Whether the snapshot holds what `basis` needs; `custom` always can. */
export function isPriceBasisAvailable(basis: PriceBasis, snapshot: PriceSnapshot): boolean {
    switch (basis) {
        case "spot":
            return snapshot.gold !== null && snapshot.silver !== null;
        case "bajusResale":
        case "bajusRetail":
            return snapshot.bajus !== null;
        case "custom":
            return true;
    }
}

/**
 * The price basis a fresh form opens on. BAJUS resale for taka when BAJUS
 * could be read — the price a Bangladeshi jeweller would actually pay, which
 * is what the gold is worth to its owner. Spot otherwise, and the reader's own
 * price when neither feed answered.
 */
export function defaultPriceBasis(currency: CurrencyCode, snapshot: PriceSnapshot): PriceBasis {
    if (currency === "BDT" && snapshot.bajus !== null) {
        return "bajusResale";
    }

    if (snapshot.gold !== null && snapshot.silver !== null) {
        return "spot";
    }

    return snapshot.bajus !== null ? "bajusResale" : "custom";
}

export function createForm(
    snapshot: PriceSnapshot,
    currency: CurrencyCode = DEFAULT_CURRENCY,
    rules: ZakatRules = DEFAULT_RULES,
    priceBasis: PriceBasis = defaultPriceBasis(currency, snapshot),
): ZakatForm {
    return {
        currency,
        rules,
        priceBasis,
        customPrices: { gold: "", silver: "" },
        resaleDeduction: DEFAULT_RESALE_DEDUCTION,
        isMinor: false,
        money: {},
        metals: [],
        crypto: [],
        longTermShares: { value: "", currency, method: "full", ratioPercent: "" },
    };
}

/** The money a field holds, in the report currency unless it names another. */
export function fieldOf(form: ZakatForm, kind: MoneyKind): MoneyField {
    return form.money[kind] ?? { amount: "", currency: form.currency };
}

const ALL_KINDS: readonly MoneyKind[] = MONEY_SECTION_ORDER.flatMap(
    (section) => MONEY_SECTIONS[section],
);

export function toZakatInput(form: ZakatForm): ZakatInput {
    const money: MoneyLine[] = ALL_KINDS.flatMap((kind) => {
        const field = form.money[kind];

        return field === undefined || field.amount.trim().length === 0
            ? []
            : [{ id: kind, kind, label: "", amount: field.amount, currency: field.currency }];
    });

    return {
        currency: form.currency,
        rules: form.rules,
        priceBasis: form.priceBasis,
        customPrices: form.customPrices,
        resaleDeduction: form.resaleDeduction,
        isMinor: form.isMinor,
        money,
        metals: form.metals,
        crypto: form.crypto,
        longTermShares: form.longTermShares,
    };
}

/** Whether anything at all has been entered, for the empty state. */
export function isBlank(form: ZakatForm): boolean {
    return (
        Object.values(form.money).every((field) => field.amount.trim().length === 0) &&
        form.metals.every((item) => item.weight.trim().length === 0) &&
        form.crypto.every((coin) => coin.amount.trim().length === 0) &&
        form.longTermShares.value.trim().length === 0
    );
}
