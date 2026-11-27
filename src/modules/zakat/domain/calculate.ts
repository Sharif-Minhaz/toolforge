import { LIABILITY_KINDS } from "../types";
import type {
    BreakdownLine,
    LiabilityKind,
    LineTreatment,
    MetalItem,
    MoneyKind,
    NisabTest,
    PriceSnapshot,
    ZakatFailure,
    ZakatInput,
    ZakatOutcome,
    ZakatRules,
    ZakatVerdict,
} from "../types";
import { parseAmount } from "./amount";
import {
    GRAMS_PER_UNIT,
    LUNAR_RATE,
    MAJORITY_KARAT,
    MAX_CRYPTO_LINES,
    MAX_METAL_ITEMS,
    MAX_MONEY_LINES,
    MINOR_DIGITS,
    NISAB_GRAMS,
    SHARE_PROXY,
    SOLAR_RATE,
    SOLAR_ROUNDED_RATE,
    WORKING_DIGITS,
} from "./constants";
import {
    compare,
    div,
    int,
    isZero,
    max,
    mul,
    parseExact,
    ratio,
    sub,
    sum,
    toDecimal,
    ZERO,
    type Exact,
} from "./exact";
import { isFailure, pricesForSettings, type PriceTable } from "./pricing";

/**
 * The calculation: one pure function from what was entered, under which rules,
 * at which prices, to the figure and every step that produced it.
 *
 * In order:
 *
 * 1. Every amount is parsed exactly and converted to the report currency at
 *    the day's rate. A line in a currency with no rate is a named refusal, not
 *    a zero — silently dropping a Saudi riyal account would understate zakat.
 * 2. Each asset is valued and given a treatment: counted, counted in part
 *    (long-term shares), or exempt (worn jewellery under the majority view).
 *    Interest held inside those balances is taken back out: it is not the
 *    owner's wealth, and is reported apart, to be given away in full.
 * 3. Debts are deducted as far as the debt rule allows.
 * 4. The nisab test. Under `auto`, wealth that is gold and nothing else is
 *    weighed against the gold nisab (7.5 vori), and silver and nothing else
 *    against the silver nisab (52.5 vori) — at full weight or pure content, per
 *    the karat rule, and scaled down by any debts. Anything mixed is valued
 *    against the silver nisab. `silver` and `gold` value it against that metal.
 * 5. If due, 2.5% — or 2.5% × 365 / 354, or 2.6%, for a solar year — of the **whole** net
 *    wealth, not just the part above nisab. The advance already paid comes off,
 *    and the remainder is rounded **up** to the currency's smallest coin.
 *
 * Nothing is rounded before step 5. Every figure handed back is a decimal
 * string, at `WORKING_DIGITS` places, for display; the arithmetic never reads
 * them back.
 */

const LIABILITY_KINDS_SET: ReadonlySet<MoneyKind> = new Set<LiabilityKind>(LIABILITY_KINDS);

/**
 * Whether the debt rule lets this kind of debt reduce zakatable wealth.
 *
 * What is due by the zakat date always does — bills, wages, tax, and zakat
 * left unpaid from earlier years, which is a debt like any other (As-Sunnah /
 * IFA Consultancy, Hanafi). What falls due over the next twelve months —
 * instalments, a business loan that bought stock, the part of a wife's mahr
 * the husband firmly means to pay this year — needs the `year` or `all` rule.
 * The rest of a long loan needs `all`.
 */
export function isDeductible(kind: LiabilityKind, rules: ZakatRules): boolean {
    switch (kind) {
        case "instalmentsYear":
        case "businessLoanYear":
        case "mahrDue":
            return rules.debts !== "due";
        case "longTermRemaining":
            return rules.debts === "all";
        case "debtsDueNow":
        case "billsDue":
        case "wagesDue":
        case "taxDue":
        case "pastZakatDue":
            return true;
    }
}

function isLiability(kind: MoneyKind): kind is LiabilityKind {
    return LIABILITY_KINDS_SET.has(kind);
}

const RATES = { lunar: LUNAR_RATE, solar: SOLAR_RATE, solarRounded: SOLAR_ROUNDED_RATE } as const;

function rateFor(rules: ZakatRules): Exact {
    const rate = RATES[rules.year];

    return ratio(rate.n, rate.d);
}

const exactOf = (text: string): Exact => parseExact(text) ?? ZERO;

const show = (value: Exact) => toDecimal(value, WORKING_DIGITS);

type Parsed = { readonly ok: true; readonly value: Exact } | ZakatFailure;

function parseLine(text: string, lineId: string): Parsed {
    const parsed = parseAmount(text);

    return parsed.ok ? parsed : { ok: false, reason: parsed.reason, lineId };
}

type MetalValuation = {
    readonly line: BreakdownLine;
    readonly value: Exact;
    readonly counted: boolean;
    /** Grams counted towards the metal's weight test. */
    readonly nisabGrams: Exact;
    readonly pureGrams: Exact;
};

function valueMetal(
    item: MetalItem,
    rules: ZakatRules,
    prices: PriceTable,
): MetalValuation | ZakatFailure {
    const weight = parseLine(item.weight, item.id);

    if (!weight.ok) {
        return weight;
    }

    const perGram = prices.itemPerGram(item.metal, item.karat);
    const purity = prices.purity(item.metal, item.karat);

    // Only the traditional grade can be unknown, and only without BAJUS.
    if (perGram === null || purity === null) {
        return { ok: false, reason: "missing_bajus", lineId: item.id };
    }

    const grams = mul(weight.value, exactOf(GRAMS_PER_UNIT[item.unit]));
    const value = mul(grams, perGram);
    const pureGrams = mul(grams, purity);
    const exempt = item.use === "jewellery" && rules.jewellery === "exempt";
    const fullWeight =
        rules.karatMethod === "majority" && compare(purity, ratio(MAJORITY_KARAT, 24)) >= 0;

    const treatment: LineTreatment = exempt
        ? "exemptJewellery"
        : fullWeight
          ? "countedFullWeight"
          : "countedPureContent";

    return {
        line: {
            id: item.id,
            group: "asset",
            kind: item.metal,
            label: item.label,
            value: show(value),
            counted: show(exempt ? ZERO : value),
            treatment,
        },
        value,
        counted: !exempt,
        nisabGrams: exempt ? ZERO : fullWeight ? grams : pureGrams,
        pureGrams: exempt ? ZERO : pureGrams,
    };
}

function checkSizes(input: ZakatInput): ZakatFailure | null {
    if (
        input.money.length > MAX_MONEY_LINES ||
        input.metals.length > MAX_METAL_ITEMS ||
        input.crypto.length > MAX_CRYPTO_LINES
    ) {
        return { ok: false, reason: "too_large" };
    }

    return null;
}

export function calculateZakat(input: ZakatInput, snapshot: PriceSnapshot): ZakatOutcome {
    const oversized = checkSizes(input);

    if (oversized !== null) {
        return oversized;
    }

    const { rules } = input;
    const prices = pricesForSettings(snapshot, input);

    if (isFailure(prices)) {
        return prices;
    }

    const lines: BreakdownLine[] = [];
    const assets: Exact[] = [];
    const deductions: Exact[] = [];
    let interest = ZERO;
    let advance = ZERO;
    /** Counted assets that are neither gold nor silver, for the "one metal and nothing else" tests. */
    let nonMetal = ZERO;
    let goldValue = ZERO;
    let silverValue = ZERO;
    let goldNisabGrams = ZERO;
    let silverNisabGrams = ZERO;
    let goldPureGrams = ZERO;
    let silverPureGrams = ZERO;

    // 1–2. Money lines.
    for (const line of input.money) {
        const parsed = parseLine(line.amount, line.id);

        if (!parsed.ok) {
            return parsed;
        }

        if (isZero(parsed.value)) {
            continue;
        }

        const value = prices.convert(parsed.value, line.currency);

        if (isFailure(value)) {
            return { ...value, lineId: line.id };
        }

        if (line.kind === "advancePaid") {
            advance = sum([advance, value]);
            continue;
        }

        if (line.kind === "interestHeld") {
            interest = sum([interest, value]);
            lines.push({
                id: line.id,
                group: "asset",
                kind: line.kind,
                label: line.label,
                value: show(value),
                counted: show(mul(value, int(-1))),
                treatment: "excludedInterest",
            });
            continue;
        }

        if (isLiability(line.kind)) {
            const deductible = isDeductible(line.kind, rules);

            if (deductible) {
                deductions.push(value);
            }

            lines.push({
                id: line.id,
                group: "liability",
                kind: line.kind,
                label: line.label,
                value: show(value),
                counted: show(deductible ? value : ZERO),
                treatment: deductible ? "deducted" : "notDeductedRule",
            });
            continue;
        }

        assets.push(value);
        nonMetal = sum([nonMetal, value]);
        lines.push({
            id: line.id,
            group: "asset",
            kind: line.kind,
            label: line.label,
            value: show(value),
            counted: show(value),
            treatment: "counted",
        });
    }

    // Gold and silver.
    for (const item of input.metals) {
        const valued = valueMetal(item, rules, prices);

        if (isFailure(valued)) {
            return valued;
        }

        if (isZero(valued.value)) {
            continue;
        }

        lines.push(valued.line);

        if (!valued.counted) {
            continue;
        }

        assets.push(valued.value);

        if (item.metal === "gold") {
            goldValue = sum([goldValue, valued.value]);
            goldNisabGrams = sum([goldNisabGrams, valued.nisabGrams]);
            goldPureGrams = sum([goldPureGrams, valued.pureGrams]);
        } else {
            silverValue = sum([silverValue, valued.value]);
            silverNisabGrams = sum([silverNisabGrams, valued.nisabGrams]);
            silverPureGrams = sum([silverPureGrams, valued.pureGrams]);
        }
    }

    // Crypto, at the day's rate for each coin.
    for (const coin of input.crypto) {
        const parsed = parseLine(coin.amount, coin.id);

        if (!parsed.ok) {
            return parsed;
        }

        if (isZero(parsed.value)) {
            continue;
        }

        const value = prices.convert(parsed.value, coin.coin);

        if (isFailure(value)) {
            return { ...value, lineId: coin.id };
        }

        assets.push(value);
        nonMetal = sum([nonMetal, value]);
        lines.push({
            id: coin.id,
            group: "asset",
            kind: "crypto",
            label: coin.coin,
            value: show(value),
            counted: show(value),
            treatment: "counted",
        });
    }

    // Long-term shares: only the zakatable share of the holding.
    const shares = input.longTermShares;
    const sharesParsed = parseLine(shares.value, "longTermShares");

    if (!sharesParsed.ok) {
        return sharesParsed;
    }

    if (!isZero(sharesParsed.value)) {
        const value = prices.convert(sharesParsed.value, shares.currency);

        if (isFailure(value)) {
            return { ...value, lineId: "longTermShares" };
        }

        let share = int(1);

        if (shares.method === "proxy") {
            share = exactOf(SHARE_PROXY);
        } else if (shares.method === "ratio") {
            const percent = parseAmount(shares.ratioPercent);

            if (!percent.ok || compare(percent.value, int(100)) > 0) {
                return { ok: false, reason: "invalid_ratio", lineId: "longTermShares" };
            }

            share = div(percent.value, int(100));
        }

        const counted = mul(value, share);

        assets.push(counted);
        nonMetal = sum([nonMetal, counted]);
        lines.push({
            id: "longTermShares",
            group: "asset",
            kind: "longTermShares",
            label: "",
            value: show(value),
            counted: show(counted),
            treatment: shares.method === "full" ? "counted" : "partialShares",
        });
    }

    // 3. Totals. Interest is taken back out of the balances it sat in.
    const totalAssets = max(ZERO, sub(sum(assets), interest));
    const totalDeductions = sum(deductions);
    const net = max(ZERO, sub(totalAssets, totalDeductions));

    // 4. The nisab test.
    const nisabGrams = NISAB_GRAMS[rules.nisabStandard];
    const goldNisab = exactOf(nisabGrams.gold);
    const silverNisab = exactOf(nisabGrams.silver);
    const goldNisabValue = mul(goldNisab, prices.goldPure);
    const silverNisabValue = mul(silverNisab, prices.silverPure);

    // One metal and nothing else — no cash, no stock, not even a little of the
    // other metal — is weighed rather than valued (Hanafi; As-Sunnah's own
    // calculator says so: only gold, 7.5 vori; only silver, 52.5 vori).
    const onlyGold = !isZero(goldValue) && isZero(silverValue) && isZero(nonMetal);
    const onlySilver = !isZero(silverValue) && isZero(goldValue) && isZero(nonMetal);
    const test: NisabTest =
        rules.nisabBasis === "gold"
            ? "goldValue"
            : rules.nisabBasis === "silver"
              ? "silverValue"
              : onlyGold
                ? "goldWeight"
                : onlySilver
                  ? "silverWeight"
                  : "silverValue";

    // The weight test after debts: the counted grams, scaled by how much of the
    // metal's value is left once they are paid.
    const weighed =
        test === "goldWeight" ? goldNisabGrams : test === "silverWeight" ? silverNisabGrams : null;
    const countedGrams =
        weighed !== null && !isZero(totalAssets) ? mul(weighed, div(net, totalAssets)) : null;

    const meetsNisab =
        test === "goldWeight" || test === "silverWeight"
            ? countedGrams !== null &&
              compare(countedGrams, test === "goldWeight" ? goldNisab : silverNisab) >= 0
            : compare(net, test === "goldValue" ? goldNisabValue : silverNisabValue) >= 0;

    const verdict: ZakatVerdict = isZero(net)
        ? "nothing"
        : input.isMinor && rules.minors === "exempt"
          ? "minorExempt"
          : meetsNisab
            ? "due"
            : "belowNisab";

    // 5. The figure.
    const rate = rateFor(rules);
    const zakat = verdict === "due" ? mul(net, rate) : ZERO;
    const payable = max(ZERO, sub(zakat, advance));
    // Pure grams of gold and silver owed, for somebody who pays in metal: the
    // rate on the metal's own share of the net, after debts.
    const netShare = isZero(totalAssets) ? ZERO : div(net, totalAssets);
    const metalGrams = (grams: Exact) =>
        verdict === "due" ? mul(mul(grams, netShare), rate) : ZERO;

    return {
        ok: true,
        verdict,
        test,
        currency: input.currency,
        totalAssets: show(totalAssets),
        totalDeductions: show(totalDeductions),
        net: show(net),
        nisab: {
            goldGrams: nisabGrams.gold,
            silverGrams: nisabGrams.silver,
            goldValue: show(goldNisabValue),
            silverValue: show(silverNisabValue),
            applied: show(
                test === "silverValue" || test === "silverWeight"
                    ? silverNisabValue
                    : goldNisabValue,
            ),
            countedGrams: countedGrams === null ? null : show(countedGrams),
        },
        rate: toDecimal(rate, 10),
        zakat: show(zakat),
        advancePaid: show(advance),
        payable: toDecimal(payable, MINOR_DIGITS[input.currency], "up"),
        interestToPurify: toDecimal(interest, MINOR_DIGITS[input.currency], "up"),
        metalZakatGrams: {
            gold: toDecimal(metalGrams(goldPureGrams), 4, "up"),
            silver: toDecimal(metalGrams(silverPureGrams), 4, "up"),
        },
        pricePerGram: { gold: show(prices.goldPure), silver: show(prices.silverPure) },
        lines,
    };
}
