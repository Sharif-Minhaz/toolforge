import { describe, expect, test } from "bun:test";

import { calculateZakat } from "@/modules/zakat/domain/calculate";
import { compareViews } from "@/modules/zakat/domain/compare";
import { VIEW_RULES } from "@/modules/zakat/domain/rules";

import { SNAPSHOT, expectResult, gold, input, money } from "./fixtures";

// At these prices: pure gold 12,000 BDT/g, pure silver 120 BDT/g.
// Hanafi silver nisab: 612.36 g × 120 = 73,483.20 BDT.

describe("the rate and the whole-wealth rule", () => {
    test("2.5% of all net wealth, not of the part above nisab", () => {
        const result = expectResult(
            calculateZakat(input({ money: [money("cash", "1,000,000")] }), SNAPSHOT),
        );

        expect(result.verdict).toBe("due");
        expect(result.test).toBe("silverValue");
        expect(result.nisab.silverValue).toBe("73483.200000");
        expect(result.zakat).toBe("25000.000000");
        expect(result.payable).toBe("25000.00");
    });

    test("a solar year pays 2.5% × 365 / 354, rounded up to the paisa", () => {
        const result = expectResult(
            calculateZakat(
                input({ money: [money("bank", "100000")], rules: { year: "solar" } }),
                SNAPSHOT,
            ),
        );

        // 100,000 × 73 / 2832 = 2577.6836158…
        expect(result.zakat).toBe("2577.683616");
        expect(result.payable).toBe("2577.69");
    });

    test("exactly at the nisab is due; a paisa under is not", () => {
        const at = expectResult(
            calculateZakat(input({ money: [money("cash", "73483.20")] }), SNAPSHOT),
        );
        const under = expectResult(
            calculateZakat(input({ money: [money("cash", "73483.19")] }), SNAPSHOT),
        );

        expect(at.verdict).toBe("due");
        expect(under.verdict).toBe("belowNisab");
        expect(under.payable).toBe("0.00");
    });

    test("an empty form is nothing, not below nisab", () => {
        expect(expectResult(calculateZakat(input(), SNAPSHOT)).verdict).toBe("nothing");
    });
});

describe("the Hanafi gold-only rule", () => {
    test("7.5 vori of 22 karat alone meets the gold nisab at full weight", () => {
        const result = expectResult(
            calculateZakat(
                input({ metals: [gold("7.5", { unit: "vori", karat: 22, use: "jewellery" })] }),
                SNAPSHOT,
            ),
        );

        expect(result.test).toBe("goldWeight");
        expect(result.nisab.countedGrams).toBe("87.480000");
        expect(result.verdict).toBe("due");
        // 87.48 g × 12,000 × 22/24 = 962,280; × 2.5% = 24,057.
        expect(result.net).toBe("962280.000000");
        expect(result.payable).toBe("24057.00");
        expect(result.lines[0].treatment).toBe("countedFullWeight");
    });

    test("the same gold counted by pure content falls short", () => {
        const result = expectResult(
            calculateZakat(
                input({
                    metals: [gold("7.5", { unit: "vori", karat: 22, use: "jewellery" })],
                    rules: { karatMethod: "pure" },
                }),
                SNAPSHOT,
            ),
        );

        // 87.48 × 22/24 = 80.19 g pure.
        expect(result.nisab.countedGrams).toBe("80.190000");
        expect(result.verdict).toBe("belowNisab");
    });

    test("one taka beside the gold switches to the silver nisab", () => {
        const result = expectResult(
            calculateZakat(input({ metals: [gold("10")], money: [money("cash", "1")] }), SNAPSHOT),
        );

        expect(result.test).toBe("silverValue");
        // 10 g × 12,000 + 1 = 120,001, above 73,483.20.
        expect(result.verdict).toBe("due");
    });

    test("debts shrink the weight that is tested", () => {
        // 100 g pure = 1,200,000; a debt of 240,000 leaves 80%, so 80 g.
        const result = expectResult(
            calculateZakat(
                input({ metals: [gold("100")], money: [money("debtsDueNow", "240000")] }),
                SNAPSHOT,
            ),
        );

        expect(result.nisab.countedGrams).toBe("80.000000");
        expect(result.verdict).toBe("belowNisab");
    });

    test("pays in gold: 2.5% of the pure gold, in grams", () => {
        const result = expectResult(calculateZakat(input({ metals: [gold("100")] }), SNAPSHOT));

        expect(result.metalZakatGrams.gold).toBe("2.5000");
    });
});

describe("the majority view", () => {
    test("worn jewellery is exempt, gold kept as savings is not", () => {
        const rules = VIEW_RULES.majority;
        const result = expectResult(
            calculateZakat(
                input({
                    rules,
                    metals: [gold("50", { use: "jewellery" }), gold("10")],
                }),
                SNAPSHOT,
            ),
        );

        expect(result.lines.map((line) => line.treatment)).toEqual([
            "exemptJewellery",
            "countedPureContent",
        ]);
        expect(result.totalAssets).toBe("120000.000000");
        // 85/595 g: silver nisab 595 × 120 = 71,400; 120,000 clears it.
        expect(result.nisab.silverValue).toBe("71400.000000");
        expect(result.verdict).toBe("due");
    });

    test("a minor's wealth: exempt under Hanafi, zakatable under the majority", () => {
        const lines = [money("cash", "500000")];
        const hanafi = expectResult(
            calculateZakat(input({ money: lines, isMinor: true }), SNAPSHOT),
        );
        const majority = expectResult(
            calculateZakat(
                input({ money: lines, isMinor: true, rules: VIEW_RULES.majority }),
                SNAPSHOT,
            ),
        );

        expect(hanafi.verdict).toBe("minorExempt");
        expect(hanafi.payable).toBe("0.00");
        expect(majority.verdict).toBe("due");
    });
});

describe("debts", () => {
    const lines = [
        money("cash", "1000000"),
        money("debtsDueNow", "10000"),
        money("instalmentsYear", "120000"),
        money("longTermRemaining", "500000"),
    ];

    test("a year of instalments, but not the rest of the loan", () => {
        const result = expectResult(calculateZakat(input({ money: lines }), SNAPSHOT));

        expect(result.totalDeductions).toBe("130000.000000");
        expect(result.lines.at(-1)?.treatment).toBe("notDeductedRule");
    });

    test("only what is due now", () => {
        const result = expectResult(
            calculateZakat(input({ money: lines, rules: { debts: "due" } }), SNAPSHOT),
        );

        expect(result.totalDeductions).toBe("10000.000000");
    });

    test("every debt", () => {
        const result = expectResult(
            calculateZakat(input({ money: lines, rules: { debts: "all" } }), SNAPSHOT),
        );

        expect(result.totalDeductions).toBe("630000.000000");
        expect(result.net).toBe("370000.000000");
    });

    test("debts larger than the wealth leave nothing, never a negative", () => {
        const result = expectResult(
            calculateZakat(
                input({ money: [money("cash", "100"), money("debtsDueNow", "1000")] }),
                SNAPSHOT,
            ),
        );

        expect(result.net).toBe("0.000000");
        expect(result.verdict).toBe("nothing");
    });
});

describe("interest, the advance, currencies, coins and shares", () => {
    test("interest is taken out of the balance and reported to give away", () => {
        const result = expectResult(
            calculateZakat(
                input({ money: [money("bank", "1000000"), money("interestHeld", "20000")] }),
                SNAPSHOT,
            ),
        );

        expect(result.net).toBe("980000.000000");
        expect(result.payable).toBe("24500.00");
        expect(result.interestToPurify).toBe("20000.00");
    });

    test("an advance already paid comes off what is left to pay", () => {
        const result = expectResult(
            calculateZakat(
                input({ money: [money("cash", "1000000"), money("advancePaid", "5000")] }),
                SNAPSHOT,
            ),
        );

        expect(result.zakat).toBe("25000.000000");
        expect(result.payable).toBe("20000.00");
    });

    test("a riyal account is converted at the day's rate", () => {
        // 37,500 SAR = 10,000 USD = 1,200,000 BDT.
        const result = expectResult(
            calculateZakat(input({ money: [money("bank", "37500", "SAR")] }), SNAPSHOT),
        );

        expect(result.net).toBe("1200000.000000");
    });

    test("a currency with no rate is refused, naming it — never counted as zero", () => {
        const line = money("bank", "100", "EUR");
        const outcome = calculateZakat(input({ money: [line] }), SNAPSHOT);

        expect(outcome).toEqual({
            ok: false,
            reason: "missing_rate",
            code: "EUR",
            lineId: line.id,
        });
    });

    test("half a bitcoin at $100,000", () => {
        const result = expectResult(
            calculateZakat(input({ crypto: [{ id: "c1", coin: "BTC", amount: "0.5" }] }), SNAPSHOT),
        );

        expect(result.net).toBe("6000000.000000");
    });

    test("long-term shares: the 25% proxy, or a balance-sheet ratio", () => {
        const proxy = expectResult(
            calculateZakat(
                input({
                    longTermShares: {
                        value: "400000",
                        currency: "BDT",
                        method: "proxy",
                        ratioPercent: "",
                    },
                }),
                SNAPSHOT,
            ),
        );
        const ratio = expectResult(
            calculateZakat(
                input({
                    longTermShares: {
                        value: "400000",
                        currency: "BDT",
                        method: "ratio",
                        ratioPercent: "37.5",
                    },
                }),
                SNAPSHOT,
            ),
        );

        expect(proxy.net).toBe("100000.000000");
        expect(ratio.net).toBe("150000.000000");
        expect(
            calculateZakat(
                input({
                    longTermShares: {
                        value: "1",
                        currency: "BDT",
                        method: "ratio",
                        ratioPercent: "101",
                    },
                }),
                SNAPSHOT,
            ),
        ).toMatchObject({ ok: false, reason: "invalid_ratio" });
    });
});

describe("price bases", () => {
    test("BAJUS sale value: the published price less the jeweller's deduction", () => {
        // 1 vori 22k = 11.664 g × 15,000 × 0.83 = 145,216.80.
        const result = expectResult(
            calculateZakat(
                input({
                    priceBasis: "bajusResale",
                    metals: [gold("1", { unit: "vori", karat: 22 })],
                }),
                SNAPSHOT,
            ),
        );

        expect(result.totalAssets).toBe("145216.800000");
        // The nisab is priced at market, without the deduction: 15,000 × 24/22.
        expect(result.pricePerGram.gold).toBe("16363.636364");
        // Silver: 220 × 24/22 = 240 a gram; × 612.36 g.
        expect(result.nisab.silverValue).toBe("146966.400000");
    });

    test("the deduction is the reader's to set, within reason", () => {
        const at = (resaleDeduction: string) =>
            calculateZakat(
                input({
                    priceBasis: "bajusResale",
                    resaleDeduction,
                    metals: [gold("1", { unit: "vori", karat: 22 })],
                }),
                SNAPSHOT,
            );

        expect(expectResult(at("15")).totalAssets).toBe("148716.000000");
        expect(expectResult(at("")).totalAssets).toBe("174960.000000");
        expect(at("51")).toEqual({ ok: false, reason: "invalid_deduction" });
        expect(at("-1")).toEqual({ ok: false, reason: "invalid_deduction" });
    });

    test("traditional gold is priced and weighed from BAJUS, and refused without it", () => {
        // 10 g traditional at 10,000 retail; purity 22 × 10,000 / 15,000 = 14.67 karat.
        const traditional = gold("10", { karat: "traditional" });
        const retail = expectResult(
            calculateZakat(input({ priceBasis: "bajusRetail", metals: [traditional] }), SNAPSHOT),
        );

        expect(retail.totalAssets).toBe("100000.000000");
        expect(retail.lines[0].treatment).toBe("countedFullWeight");
        expect(
            calculateZakat(input({ priceBasis: "spot", metals: [traditional] }), {
                ...SNAPSHOT,
                bajus: null,
            }),
        ).toEqual({ ok: false, reason: "missing_bajus", lineId: traditional.id });
    });

    test("BAJUS retail, and a karat BAJUS does not list", () => {
        const result = expectResult(
            calculateZakat(
                input({ priceBasis: "bajusRetail", metals: [gold("1", { karat: 14 })] }),
                SNAPSHOT,
            ),
        );

        // 15,000 × 24/22 × 14/24 = 9,545.4545…
        expect(result.totalAssets).toBe("9545.454545");
    });

    test("a custom price is required to be positive", () => {
        expect(
            calculateZakat(
                input({ priceBasis: "custom", customPrices: { gold: "0", silver: "120" } }),
                SNAPSHOT,
            ),
        ).toEqual({ ok: false, reason: "invalid_custom_price" });
    });

    test("no spot price and no BAJUS are both named refusals", () => {
        const bare = { ...SNAPSHOT, gold: null, bajus: null };

        expect(calculateZakat(input(), bare)).toEqual({ ok: false, reason: "missing_metal_price" });
        expect(calculateZakat(input({ priceBasis: "bajusResale" }), bare)).toEqual({
            ok: false,
            reason: "missing_bajus",
        });
    });
});

describe("refusals about the input", () => {
    test("a malformed amount names its line", () => {
        const line = money("cash", "12a");

        expect(calculateZakat(input({ money: [line] }), SNAPSHOT)).toEqual({
            ok: false,
            reason: "invalid_amount",
            lineId: line.id,
        });
    });

    test("Bangla digits and lakh grouping are read", () => {
        const result = expectResult(
            calculateZakat(input({ money: [money("cash", "১০,০০,০০০")] }), SNAPSHOT),
        );

        expect(result.net).toBe("1000000.000000");
    });
});

describe("compareViews", () => {
    test("lists each other opinion once, never the reader's own", () => {
        const rows = compareViews(
            input({ metals: [gold("7.5", { unit: "vori", karat: 22, use: "jewellery" })] }),
            SNAPSHOT,
        );
        const variants = rows.map((row) => row.variant);

        expect(variants).not.toContain("hanafi");
        expect(new Set(variants).size).toBe(variants.length);

        // Worn 22k jewellery: zakatable for Hanafis, exempt for the majority.
        expect(rows.find((row) => row.variant === "majority")?.verdict).toBe("nothing");
        expect(rows.find((row) => row.variant === "solarYear")?.payable).toBe("24804.54");
        // 962,280 × 73 / 2832 = 24,804.534…, rounded up.
    });
});

describe("As-Sunnah alignment", () => {
    test("silver and nothing else is weighed against 52.5 vori", () => {
        const silver = (weight: string) =>
            gold(weight, { metal: "silver", unit: "vori", karat: 22, use: "jewellery" });
        const at = expectResult(calculateZakat(input({ metals: [silver("52.5")] }), SNAPSHOT));
        const under = expectResult(calculateZakat(input({ metals: [silver("52")] }), SNAPSHOT));

        expect(at.test).toBe("silverWeight");
        expect(at.nisab.countedGrams).toBe("612.360000");
        expect(at.verdict).toBe("due");
        expect(under.verdict).toBe("belowNisab");
    });

    test("a Gregorian year at 2.6%", () => {
        const result = expectResult(
            calculateZakat(
                input({ money: [money("cash", "100000")], rules: { year: "solarRounded" } }),
                SNAPSHOT,
            ),
        );

        expect(result.payable).toBe("2600.00");
    });

    test("past zakat is deducted under every rule; mahr and a business loan need a year's view", () => {
        const lines = [
            money("cash", "1000000"),
            money("pastZakatDue", "20000"),
            money("mahrDue", "50000"),
            money("businessLoanYear", "30000"),
        ];
        const year = expectResult(calculateZakat(input({ money: lines }), SNAPSHOT));
        const due = expectResult(
            calculateZakat(input({ money: lines, rules: { debts: "due" } }), SNAPSHOT),
        );

        expect(year.totalDeductions).toBe("100000.000000");
        expect(due.totalDeductions).toBe("20000.000000");
    });

    test("amanah, deposits and a partnership share count as wealth", () => {
        const result = expectResult(
            calculateZakat(
                input({
                    money: [
                        money("depositsWithOthers", "10000"),
                        money("securityDeposits", "20000"),
                        money("partnershipShare", "70000"),
                    ],
                }),
                SNAPSHOT,
            ),
        );

        expect(result.totalAssets).toBe("100000.000000");
    });
});
