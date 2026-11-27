/**
 * The Zakat Calculator's vocabulary.
 *
 * Every rule a school of thought decides is a named option here, never a
 * hidden constant, so that a reader can see — and change — which opinion the
 * figure follows. `domain/rules.ts` holds the presets and the sources each
 * option rests on.
 */

/** Currencies a figure can be reported in. Every one is in both rate feeds. */
export const CURRENCY_CODES = [
    "BDT",
    "USD",
    "GBP",
    "EUR",
    "SAR",
    "AED",
    "QAR",
    "KWD",
    "OMR",
    "BHD",
    "MYR",
    "IDR",
    "SGD",
    "BND",
    "INR",
    "PKR",
    "LKR",
    "NPR",
    "TRY",
    "EGP",
    "MAD",
    "NGN",
    "KES",
    "ZAR",
    "CAD",
    "AUD",
    "NZD",
    "JPY",
    "CNY",
    "HKD",
    "CHF",
    "SEK",
    "NOK",
    "DKK",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** Coins a holding can be entered in, priced from the same daily rate table. */
export const CRYPTO_CODES = ["BTC", "ETH", "USDT", "USDC", "SOL", "XRP", "LTC", "ADA"] as const;

export type CryptoCode = (typeof CRYPTO_CODES)[number];

export type RateCode = CurrencyCode | CryptoCode;

/** The four presets, and "custom" once any single rule is changed. */
export const ZAKAT_VIEWS = ["hanafi", "majority", "custom"] as const;

export type ZakatView = (typeof ZAKAT_VIEWS)[number];

/**
 * Which gram figures stand for 20 mithqal of gold and 200 dirham of silver.
 * `tola`: 7.5 and 52.5 tola (87.48 g, 612.36 g), the South Asian Hanafi
 * figures. `grams`: 85 g and 595 g, Qaradawi's weighing of 'Abd al-Malik's
 * dinars, used by AAOIFI and most Arab bodies.
 */
export const NISAB_STANDARDS = ["tola", "grams"] as const;

export type NisabStandard = (typeof NISAB_STANDARDS)[number];

/**
 * What wealth is tested against.
 * `auto`: the Hanafi practice — gold alone is weighed against the gold nisab;
 * gold mixed with anything else is valued against the silver nisab.
 * `silver` / `gold`: always that metal's nisab, by value.
 */
export const NISAB_BASES = ["auto", "silver", "gold"] as const;

export type NisabBasis = (typeof NISAB_BASES)[number];

/**
 * How an alloy counts. `majority`: an item that is mostly gold (12 karat and
 * up) counts at its full weight, the classical Hanafi reading. `pure`: only
 * the gold in it counts, weight × karat / 24.
 */
export const KARAT_METHODS = ["majority", "pure"] as const;

export type KaratMethod = (typeof KARAT_METHODS)[number];

/** Whether jewellery worn for adornment is zakatable. */
export const JEWELLERY_RULES = ["zakatable", "exempt"] as const;

export type JewelleryRule = (typeof JEWELLERY_RULES)[number];

/**
 * Lunar year at 2.5%; a solar year at 2.5% × 365 / 354 (2.5776…%, AAOIFI); or
 * a solar year at 2.6%, that figure rounded up as a precaution — what
 * As-Sunnah Foundation's calculator (advised by IFA Consultancy) uses.
 */
export const YEAR_TYPES = ["lunar", "solar", "solarRounded"] as const;

export type YearType = (typeof YEAR_TYPES)[number];

/**
 * Which debts reduce zakatable wealth.
 * `year`: what falls due in the next twelve months — debts due now plus a
 * year of instalments on anything longer (NZF, contemporary Hanafi, the
 * Bangladesh guideline). `due`: only what is due by the zakat date (Ibn Baz,
 * Ibn 'Uthaymeen, Zakat Foundation of America). `all`: every debt, immediate
 * and deferred (Qaradawi).
 */
export const DEBT_RULES = ["year", "due", "all"] as const;

export type DebtRule = (typeof DEBT_RULES)[number];

/** Whether the wealth of somebody not yet adult is zakatable. */
export const MINOR_RULES = ["exempt", "zakatable"] as const;

export type MinorRule = (typeof MINOR_RULES)[number];

export type ZakatRules = {
    readonly nisabStandard: NisabStandard;
    readonly nisabBasis: NisabBasis;
    readonly karatMethod: KaratMethod;
    readonly jewellery: JewelleryRule;
    readonly year: YearType;
    readonly debts: DebtRule;
    readonly minors: MinorRule;
};

/**
 * Where metal prices come from. `spot`: the international price, adjusted
 * for purity. `bajusResale`: the Bangladesh Jewellers Association's price
 * less its published 15% buyback deduction — what the gold would actually
 * fetch, which is what most scholars value at. `bajusRetail`: BAJUS's selling
 * price, the higher figure some prefer as a precaution. `custom`: the reader's
 * own price per gram of pure gold and pure silver.
 */
export const PRICE_BASES = ["spot", "bajusResale", "bajusRetail", "custom"] as const;

export type PriceBasis = (typeof PRICE_BASES)[number];

/**
 * Purities a metal item can be entered at. `traditional` is the Bangladeshi
 * "সনাতনী" grade, which has no fixed karat: BAJUS prices it, and its purity is
 * read off that price (see `pricing.ts`), so it needs BAJUS to be priced.
 */
export const KARATS = [24, 22, 21, 18, 14, "traditional"] as const;

export type Karat = (typeof KARATS)[number];

/** The grades BAJUS publishes a price for. */
export const BAJUS_GRADES = ["k22", "k21", "k18", "traditional"] as const;

export type BajusGrade = (typeof BAJUS_GRADES)[number];

/** Grams, or the Bangladeshi jeweller's vori · ana · rati · point. */
export const WEIGHT_UNITS = ["gram", "vori", "ana", "rati", "ounce"] as const;

export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/** Whether a metal item is worn, or held as savings. Only the first can be exempt. */
export const METAL_USES = ["jewellery", "savings"] as const;

export type MetalUse = (typeof METAL_USES)[number];

/**
 * One amount of money, in whatever currency it is held in. Amounts are plain
 * decimal strings as typed; an empty string is "nothing entered".
 */
export type MoneyLine = {
    readonly id: string;
    readonly kind: MoneyKind;
    readonly label: string;
    readonly amount: string;
    readonly currency: CurrencyCode;
};

export type MetalItem = {
    readonly id: string;
    readonly metal: "gold" | "silver";
    readonly label: string;
    /** A decimal string in `unit`. */
    readonly weight: string;
    readonly unit: WeightUnit;
    readonly karat: Karat;
    readonly use: MetalUse;
};

export type CryptoLine = {
    readonly id: string;
    readonly coin: CryptoCode;
    readonly amount: string;
};

/**
 * Shares held for the long term: the market value, and how much of it is
 * zakatable. `full`: all of it, the precaution. `proxy`: NZF's 25%. `ratio`: a
 * zakatable-assets ratio read off the company's balance sheet.
 */
export const SHARE_METHODS = ["full", "proxy", "ratio"] as const;

export type ShareMethod = (typeof SHARE_METHODS)[number];

/**
 * Every money field, each with a fixed treatment. The groups are what the
 * form shows; the treatment is what `calculate.ts` does with it.
 */
export const ASSET_KINDS = [
    // Cash
    "cash",
    "bank",
    "mobileWallet",
    "foreignCash",
    // Savings and investment
    "fixedDeposit",
    "savingsCertificate",
    "providentVoluntary",
    "insurancePremiums",
    "tradingShares",
    "mutualFunds",
    // Business
    "businessCash",
    "inventory",
    "businessReceivables",
    "partnershipShare",
    // Owed to you, property, and the rest
    "loansGiven",
    "depositsWithOthers",
    "securityDeposits",
    "resaleProperty",
    "rentHeld",
    "otherAssets",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export const LIABILITY_KINDS = [
    "debtsDueNow",
    "billsDue",
    "wagesDue",
    "taxDue",
    "pastZakatDue",
    "instalmentsYear",
    "businessLoanYear",
    "mahrDue",
    "longTermRemaining",
] as const;

export type LiabilityKind = (typeof LIABILITY_KINDS)[number];

/** Amounts that are not wealth or debt but change what is paid. */
export const ADJUSTMENT_KINDS = ["interestHeld", "advancePaid"] as const;

export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export type MoneyKind = AssetKind | LiabilityKind | AdjustmentKind;

export type ZakatInput = {
    readonly currency: CurrencyCode;
    readonly rules: ZakatRules;
    readonly priceBasis: PriceBasis;
    /** Per gram of pure metal, in `currency`; used only when `priceBasis` is `custom`. */
    readonly customPrices: { readonly gold: string; readonly silver: string };
    /**
     * Percent a jeweller takes off the BAJUS price when buying gold or silver
     * back; used only when `priceBasis` is `bajusResale`. Holdings are valued
     * net of it, the nisab is not — see `pricing.ts`.
     */
    readonly resaleDeduction: string;
    readonly isMinor: boolean;
    readonly money: readonly MoneyLine[];
    readonly metals: readonly MetalItem[];
    readonly crypto: readonly CryptoLine[];
    readonly longTermShares: {
        readonly value: string;
        readonly currency: CurrencyCode;
        readonly method: ShareMethod;
        /** 0–100, the zakatable share of the company's assets, for `ratio`. */
        readonly ratioPercent: string;
    };
};

// --- prices -------------------------------------------------------------

export type MetalSource = "gold-api" | "currency-api";

export type MetalQuote = {
    /** Decimal string, USD per troy ounce of pure metal. */
    readonly usdPerOunce: string;
    /** ISO instant the source dates the price to. */
    readonly asOf: string;
    readonly source: MetalSource;
};

export type RateSource = "frankfurter" | "currency-api";

export type RateTable = {
    /** Decimal strings: units of each code per one US dollar. `USD` is always `"1"`. */
    readonly perUsd: Partial<Record<RateCode, string>>;
    readonly asOf: string;
    readonly source: RateSource;
};

export type BajusPrices = {
    /** Decimal strings, BDT per gram, VAT included. */
    readonly gold: Readonly<Record<BajusGrade, string>>;
    readonly silver: Readonly<Record<BajusGrade, string>>;
    /** `YYYY-MM-DD` of the notice, when the page names one. */
    readonly effectiveDate: string | null;
};

/** What the server could read, part by part; `null` is a part it could not. */
export type PriceSnapshot = {
    readonly gold: MetalQuote | null;
    readonly silver: MetalQuote | null;
    readonly rates: RateTable | null;
    readonly bajus: BajusPrices | null;
};

// --- result -------------------------------------------------------------

/** Why a line counts, is left out, or is cut — each a message key. */
export const LINE_TREATMENTS = [
    "counted",
    "countedPureContent",
    "countedFullWeight",
    "exemptJewellery",
    "partialShares",
    "deducted",
    "notDeductedRule",
    "excludedInterest",
] as const;

export type LineTreatment = (typeof LINE_TREATMENTS)[number];

export type BreakdownLine = {
    readonly id: string;
    readonly group: "asset" | "liability";
    /** The money kind, or `gold`, `silver`, `crypto`, `longTermShares`. */
    readonly kind: MoneyKind | "gold" | "silver" | "crypto" | "longTermShares";
    readonly label: string;
    /** Decimal string in the report currency, before the rule is applied. */
    readonly value: string;
    /** What enters the sum: the counted part of an asset, the deducted part of a debt. */
    readonly counted: string;
    readonly treatment: LineTreatment;
};

/** Why there is no figure. Each keeps its own name. */
export const ZAKAT_FAILURES = [
    "invalid_amount",
    "too_large",
    "missing_metal_price",
    "missing_rate",
    "missing_bajus",
    "invalid_custom_price",
    "invalid_deduction",
    "invalid_ratio",
] as const;

export type ZakatFailureReason = (typeof ZAKAT_FAILURES)[number];

export type ZakatFailure = {
    readonly ok: false;
    readonly reason: ZakatFailureReason;
    /** The line the reason is about, when it is about one. */
    readonly lineId?: string;
    /** The code a rate was missing for. */
    readonly code?: string;
};

/** Which test decided the nisab, so the result can say so in words. */
export const NISAB_TESTS = ["goldWeight", "silverWeight", "silverValue", "goldValue"] as const;

export type NisabTest = (typeof NISAB_TESTS)[number];

export type ZakatVerdict = "due" | "belowNisab" | "minorExempt" | "nothing";

export type ZakatResult = {
    readonly ok: true;
    readonly verdict: ZakatVerdict;
    readonly test: NisabTest;
    readonly currency: CurrencyCode;
    /** Decimal strings in the report currency, unrounded to the minor unit's precision + 4. */
    readonly totalAssets: string;
    readonly totalDeductions: string;
    readonly net: string;
    readonly nisab: {
        readonly goldGrams: string;
        readonly silverGrams: string;
        readonly goldValue: string;
        readonly silverValue: string;
        /** The threshold actually applied, by value; for `goldWeight` the weight is in `goldGrams`. */
        readonly applied: string;
        /**
         * For a weight test: grams counted against that metal's nisab, after
         * debts. `null` when the test was by value.
         */
        readonly countedGrams: string | null;
    };
    /** The rate as a decimal string, e.g. `0.025`. */
    readonly rate: string;
    /** Exact zakat before the advance already paid. */
    readonly zakat: string;
    readonly advancePaid: string;
    /** What is left to pay, rounded **up** to the currency's minor unit. */
    readonly payable: string;
    /** Interest held, to be given away in full — not zakat, and not in `net`. */
    readonly interestToPurify: string;
    /** Zakat on the counted gold and silver, expressed in grams of pure metal. */
    readonly metalZakatGrams: { readonly gold: string; readonly silver: string };
    /** Per gram of pure metal in the report currency, at market — what the nisab is priced at. */
    readonly pricePerGram: { readonly gold: string; readonly silver: string };
    readonly lines: readonly BreakdownLine[];
};

export type ZakatOutcome = ZakatResult | ZakatFailure;
