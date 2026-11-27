import { z } from "zod";

import type { JsonValue } from "@/modules/tools/types/json-document";
import { calculateZakat } from "@/modules/zakat/domain/calculate";
import { compareViews } from "@/modules/zakat/domain/compare";
import {
    DEFAULT_CURRENCY,
    DEFAULT_RESALE_DEDUCTION,
    GRAMS_PER_VORI,
    NISAB_GRAMS,
} from "@/modules/zakat/domain/constants";
import { mul, parseExact, toDecimal, ZERO, type Exact } from "@/modules/zakat/domain/exact";
import { isFailure, pricesForSettings } from "@/modules/zakat/domain/pricing";
import { DEFAULT_RULES, VIEW_RULES } from "@/modules/zakat/domain/rules";
import {
    ASSET_KINDS,
    KARATS,
    LIABILITY_KINDS,
    PRICE_BASES,
    type MoneyLine,
    type PriceSnapshot,
    type ZakatRules,
} from "@/modules/zakat/types";
import {
    amountTextSchema,
    currencySchema,
    metalListSchema,
    shareMethodSchema,
    zakatRulesSchema,
} from "@/modules/zakat/validation/zakat-options";

import { defineMcpTool } from "../domain/define-tool";
import { refuseWithReason, succeed } from "../domain/result";

/**
 * The Zakat Calculator, in two halves, split along the network.
 *
 * `calculate` is offline: the caller supplies today's price per gram of pure
 * gold and silver, and every amount in one currency. It is the same domain
 * function the page runs, so the same holdings under the same rules give the
 * same figure to the paisa. It does not fetch prices itself, because that would
 * make every calculation a network call behind the access token — and a model
 * that already has a price, or was given one, should not need one.
 *
 * `prices` is the network half: today's spot and BAJUS prices per gram in any
 * supported currency, read through the page's own caches, so a call costs the
 * upstream feeds nothing a page view would not.
 */

const MONEY_KINDS = [...ASSET_KINDS, ...LIABILITY_KINDS, "interestHeld", "advancePaid"] as const;

const moneySchema = z
    .partialRecord(z.enum(MONEY_KINDS), amountTextSchema)
    .default({})
    .describe(
        `Amounts in \`currency\`, keyed by kind. Assets: ${ASSET_KINDS.join(", ")}. Debts: ${LIABILITY_KINDS.join(", ")} — which reduce zakat depends on \`rules.debts\`. interestHeld is interest inside the balances above, taken back out and reported to give away; advancePaid is zakat already paid this year. Plain decimals; commas and Bangla digits are accepted`,
    );

export const zakatCalculatorCalculateTool = defineMcpTool({
    toolId: "zakat-calculator",
    verb: "calculate",
    title: "Calculate zakat",
    description:
        "Work out zakat on a person's wealth under a named school of thought, in exact arithmetic. `view` hanafi (default; 87.48 g / 612.36 g nisab, gold alone weighed against 7.5 vori and silver alone against 52.5 vori, anything mixed valued against the silver nisab, worn jewellery zakatable, debts due within 12 months deducted, a minor's wealth exempt) or majority (85 g / 595 g, silver nisab, worn jewellery exempt, pure gold content only, only debts due now, a minor's wealth zakatable); `rules` overrides any single opinion. The rate is 2.5% of all net wealth once nisab is met; over a Gregorian year 2.5 × 365 / 354 % (`year: solar`) or 2.6% (`year: solarRounded`, As-Sunnah Foundation). Supply today's market price per gram of PURE gold and silver in `currency` (call toolforge_zakat_calculator_prices for them); the nisab is valued at these, and each piece at the price × karat / 24, so pass a sale price if pieces should be valued at what a jeweller would pay. Gold and silver pieces take a weight, a unit (gram, vori = 11.664 g, ana, rati, ounce = troy ounce), a karat and whether they are worn jewellery or savings. Returns the payable amount rounded up to the smallest coin, the nisab test that decided it, every line with its treatment, and the same holdings under the other common views.",
    kind: "offline",
    inputSchema: z.object({
        currency: currencySchema
            .default(DEFAULT_CURRENCY)
            .describe("ISO code every amount and price is in"),
        goldPricePerGram: amountTextSchema.describe(
            "Price of one gram of pure (24 karat) gold, in `currency`",
        ),
        silverPricePerGram: amountTextSchema.describe(
            "Price of one gram of pure silver, in `currency`",
        ),
        view: z
            .enum(["hanafi", "majority"])
            .default("hanafi")
            .describe("The set of opinions to start from"),
        rules: zakatRulesSchema
            .partial()
            .default({})
            .describe(
                "Overrides: nisabStandard tola|grams, nisabBasis auto|silver|gold, karatMethod majority|pure, jewellery zakatable|exempt, year lunar|solar|solarRounded, debts year|due|all, minors exempt|zakatable",
            ),
        isMinor: z.boolean().default(false).describe("The wealth belongs to a child"),
        money: moneySchema,
        metals: metalListSchema
            .default([])
            .describe(
                `Gold and silver pieces; karat is one of ${KARATS.join(", ")}. traditional (সনাতনী) has no fixed karat and is priced from BAJUS, so it is refused here — weigh it as the karat a jeweller tests it at`,
            ),
        longTermShares: z
            .object({
                value: amountTextSchema.describe("Market value of shares held for the long term"),
                method: shareMethodSchema
                    .default("full")
                    .describe(
                        "full counts all of it; proxy counts 25% (NZF); ratio counts ratioPercent",
                    ),
                ratioPercent: amountTextSchema
                    .default("")
                    .describe("Zakatable share of the companies' assets, 0–100, for method ratio"),
            })
            .default({ value: "", method: "full", ratioPercent: "" })
            .describe("Shares held for dividends rather than to trade"),
    }),
    run: ({
        currency,
        goldPricePerGram,
        silverPricePerGram,
        view,
        rules,
        isMinor,
        money,
        metals,
        longTermShares,
    }) => {
        const merged: ZakatRules = {
            ...(view === "majority" ? VIEW_RULES.majority : DEFAULT_RULES),
            ...rules,
        };
        // Everything arrives in one currency, so no rate is ever looked up.
        const snapshot: PriceSnapshot = { gold: null, silver: null, rates: null, bajus: null };
        const lines: MoneyLine[] = Object.entries(money).flatMap(([kind, amount]) => {
            const known = MONEY_KINDS.find((candidate) => candidate === kind);

            return known === undefined || amount === undefined
                ? []
                : [{ id: kind, kind: known, label: "", amount, currency }];
        });
        const input = {
            currency,
            rules: merged,
            priceBasis: "custom" as const,
            customPrices: { gold: goldPricePerGram, silver: silverPricePerGram },
            // Only the BAJUS resale basis reads a deduction; here the caller's
            // own price is used as given.
            resaleDeduction: "0",
            isMinor,
            money: lines,
            metals: metals.map((item, index) => ({ ...item, id: `metal-${index + 1}` })),
            crypto: [],
            longTermShares: { ...longTermShares, currency },
        };
        const outcome = calculateZakat(input, snapshot);

        if (!outcome.ok) {
            return refuseWithReason("Zakat calculator", outcome.reason, {
                line: outcome.lineId ?? null,
            });
        }

        const comparisons = compareViews(input, snapshot);
        const data: JsonValue = {
            verdict: outcome.verdict,
            payable: outcome.payable,
            currency,
            zakatExact: outcome.zakat,
            advancePaid: outcome.advancePaid,
            rate: outcome.rate,
            totalAssets: outcome.totalAssets,
            totalDeductions: outcome.totalDeductions,
            net: outcome.net,
            nisab: { test: outcome.test, ...outcome.nisab },
            interestToPurify: outcome.interestToPurify,
            zakatInPureGrams: outcome.metalZakatGrams,
            rules: merged,
            lines: outcome.lines.map((line) => ({
                id: line.id,
                kind: line.kind,
                group: line.group,
                value: line.value,
                counted: line.counted,
                treatment: line.treatment,
            })),
            otherViews: comparisons.map((row) => ({
                variant: row.variant,
                verdict: row.verdict,
                payable: row.payable,
            })),
        };
        const summary =
            outcome.verdict === "due"
                ? `Zakat due: ${outcome.payable} ${currency} on net wealth of ${toDecimal(parseExact(outcome.net) ?? ZERO, 2)} ${currency} (${outcome.test}).`
                : `No zakat due (${outcome.verdict}); net wealth ${toDecimal(parseExact(outcome.net) ?? ZERO, 2)} ${currency} against a nisab of ${toDecimal(parseExact(outcome.nisab.applied) ?? ZERO, 2)} ${currency}.`;

        return succeed(summary, data);
    },
});

export const zakatCalculatorPricesTool = defineMcpTool({
    toolId: "zakat-calculator",
    verb: "prices",
    title: "Today's gold and silver prices for zakat",
    description:
        "Today's gold and silver prices for zakat in any supported currency, for each price basis: spot (international, live from gold-api.com, falling back to yesterday's fix), bajusResale (the Bangladesh Jewellers Association price less a jeweller's buyback deduction, `deduction` percent, 17 by default as As-Sunnah Foundation's calculator uses) and bajusRetail. For each basis: `goldPure` and `silverPure` are the market price of one gram of pure metal — what the nisab is valued at, and what toolforge_zakat_calculator_calculate takes — plus the nisab itself, and what one gram and one vori (11.664 g) of 22, 21, 18 karat and traditional pieces are worth under that basis. Also returns each feed's source and date. Makes an outbound request from the ToolForge server (cached for a quarter of an hour), so it requires the MCP access token.",
    kind: "network",
    inputSchema: z.object({
        currency: currencySchema.default(DEFAULT_CURRENCY).describe("ISO code to price in"),
        deduction: amountTextSchema
            .default(DEFAULT_RESALE_DEDUCTION)
            .describe("Jeweller's buyback deduction for bajusResale, in percent (0–50)"),
    }),
    run: async ({ currency, deduction }) => {
        // Imported here, not at the top: the repository is `server-only`, and a
        // static import would put that marker into the registry's import graph,
        // which the tests load outside a server runtime.
        const { getPriceSnapshot } = await import("@/modules/zakat/repository/prices");
        const snapshot = await getPriceSnapshot();
        const vori = parseExact(GRAMS_PER_VORI) ?? ZERO;
        const nisab = NISAB_GRAMS.tola;
        const bases: Record<string, JsonValue> = {};
        const spell = (value: Exact | null) => (value === null ? null : toDecimal(value, 2));

        for (const basis of PRICE_BASES) {
            if (basis === "custom") {
                continue;
            }

            const table = pricesForSettings(snapshot, {
                priceBasis: basis,
                currency,
                customPrices: { gold: "", silver: "" },
                resaleDeduction: deduction,
            });

            if (isFailure(table)) {
                bases[basis] = { available: false, reason: table.reason };
                continue;
            }

            const grades: Record<string, JsonValue> = {};

            for (const metal of ["gold", "silver"] as const) {
                for (const karat of [22, 21, 18, "traditional"] as const) {
                    const perGram = table.itemPerGram(metal, karat);

                    grades[`${metal}-${karat}`] = {
                        perGram: spell(perGram),
                        perVori: spell(perGram === null ? null : mul(perGram, vori)),
                    };
                }
            }

            bases[basis] = {
                available: true,
                goldPure: toDecimal(table.goldPure, 6),
                silverPure: toDecimal(table.silverPure, 6),
                nisab: {
                    silver: toDecimal(mul(parseExact(nisab.silver) ?? ZERO, table.silverPure), 2),
                    gold: toDecimal(mul(parseExact(nisab.gold) ?? ZERO, table.goldPure), 2),
                    silverGrams: nisab.silver,
                    goldGrams: nisab.gold,
                },
                pieces: grades,
            };
        }

        const anyAvailable = Object.values(bases).some(
            (entry) =>
                typeof entry === "object" &&
                entry !== null &&
                !Array.isArray(entry) &&
                entry.available === true,
        );

        if (!anyAvailable) {
            return refuseWithReason("Zakat prices", "missing_metal_price");
        }

        return succeed(`Gold and silver prices for zakat in ${currency}.`, {
            currency,
            bases,
            sources: {
                gold:
                    snapshot.gold === null
                        ? null
                        : { source: snapshot.gold.source, asOf: snapshot.gold.asOf },
                silver:
                    snapshot.silver === null
                        ? null
                        : { source: snapshot.silver.source, asOf: snapshot.silver.asOf },
                rates:
                    snapshot.rates === null
                        ? null
                        : { source: snapshot.rates.source, asOf: snapshot.rates.asOf },
                bajus:
                    snapshot.bajus === null
                        ? null
                        : { effectiveDate: snapshot.bajus.effectiveDate },
            },
        });
    },
});
