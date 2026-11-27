import { describe, expect, test } from "bun:test";

import { parseAmount } from "@/modules/zakat/domain/amount";
import { parseExact } from "@/modules/zakat/domain/exact";
import {
    readBajus,
    readFawazMetal,
    readFawazRates,
    readFrankfurter,
    readGoldApi,
} from "@/modules/zakat/domain/prices";
import { VIEW_RULES, viewOf } from "@/modules/zakat/domain/rules";

import { BAJUS_PAGE } from "./bajus-page";

// Bodies as each feed sent them on 27 Nov 2026.
const GOLD_API_XAU = {
    currency: "USD",
    currencySymbol: "$",
    exchangeRate: 1.0,
    name: "Gold",
    price: 3627.899902,
    symbol: "XAU",
    updatedAt: "2026-11-27T04:06:49Z",
    updatedAtReadable: "a few seconds ago",
};

describe("gold-api", () => {
    test("reads the price at its shortest spelling", () => {
        expect(readGoldApi("gold", GOLD_API_XAU)).toEqual({
            usdPerOunce: "3627.899902",
            asOf: "2026-11-27T04:06:49Z",
            source: "gold-api",
        });
    });

    test("refuses the wrong symbol, the wrong currency, and an implausible price", () => {
        expect(readGoldApi("silver", GOLD_API_XAU)).toBeNull();
        expect(readGoldApi("gold", { ...GOLD_API_XAU, currency: "EUR" })).toBeNull();
        expect(readGoldApi("gold", { ...GOLD_API_XAU, price: 0.36 })).toBeNull();
        expect(readGoldApi("gold", { error: "Currency not found" })).toBeNull();
    });
});

describe("currency-api", () => {
    test("metal: USD per ounce under xau.usd, dated noon UTC", () => {
        expect(
            readFawazMetal("gold", { date: "2026-11-26", xau: { usd: 3570.57, bdt: 447100.25 } }),
        ).toEqual({
            usdPerOunce: "3570.57",
            asOf: "2026-11-26T12:00:00Z",
            source: "currency-api",
        });
        expect(readFawazMetal("silver", { date: "2026-11-26", xau: { usd: 3570.57 } })).toBeNull();
    });

    test("rates: lower-case codes upper-cased, unknown codes dropped", () => {
        const table = readFawazRates({
            date: "2026-11-26",
            usd: { bdt: 125.21824801, sar: 3.75, btc: 0.0000105, zzz: 4 },
        });

        expect(table?.perUsd).toEqual({
            USD: "1",
            BDT: "125.21824801",
            SAR: "3.75",
            BTC: "0.0000105",
        });
    });
});

describe("frankfurter", () => {
    test("an array of rows, the latest date wins", () => {
        const table = readFrankfurter([
            { date: "2026-11-27", base: "USD", quote: "BDT", rate: 125.02 },
            { date: "2026-11-26", base: "USD", quote: "GBP", rate: 0.76334 },
        ]);

        expect(table).toEqual({
            perUsd: { USD: "1", BDT: "125.02", GBP: "0.76334" },
            asOf: "2026-11-27T12:00:00Z",
            source: "frankfurter",
        });
        expect(readFrankfurter([])).toBeNull();
        expect(readFrankfurter({ error: "x" })).toBeNull();
    });
});

describe("BAJUS", () => {
    test("reads all eight prices and the notice date off the page", () => {
        expect(readBajus(BAJUS_PAGE)).toEqual({
            gold: { k22: "17055.00", k21: "16290.00", k18: "13995.00", traditional: "11405.00" },
            silver: { k22: "260.00", k21: "250.00", k18: "215.00", traditional: "165.00" },
            effectiveDate: "2026-11-27",
        });
    });

    test("half a table is no table", () => {
        const withoutSilver = BAJUS_PAGE.slice(0, BAJUS_PAGE.indexOf("silver-table"));

        expect(readBajus(withoutSilver)).toBeNull();
        expect(readBajus("<html><body>Maintenance</body></html>")).toBeNull();
    });
});

describe("parseAmount", () => {
    const value = (text: string): unknown => {
        const parsed = parseAmount(text);

        return parsed.ok ? parsed.value : parsed.reason;
    };

    test("lakh and international grouping, Bangla digits, a bare decimal point", () => {
        expect(value("1,50,000")).toEqual(parseExact("150000"));
        expect(value("150,000.50")).toEqual(parseExact("150000.5"));
        expect(value("১,২৫০.৫")).toEqual(parseExact("1250.5"));
        expect(value(".5")).toEqual(parseExact("0.5"));
        expect(value("  ")).toEqual(parseExact("0"));
    });

    test("refuses what would have to be guessed at", () => {
        expect(value("-5")).toBe("invalid_amount");
        expect(value("1.2.3")).toBe("invalid_amount");
        expect(value("1e6")).toBe("invalid_amount");
        expect(value("৫।৫")).toBe("invalid_amount");
        expect(value("100000000000001")).toBe("too_large");
        expect(value("1".repeat(30))).toBe("too_large");
    });
});

describe("viewOf", () => {
    test("names a preset, and calls anything else custom", () => {
        expect(viewOf(VIEW_RULES.hanafi)).toBe("hanafi");
        expect(viewOf(VIEW_RULES.majority)).toBe("majority");
        expect(viewOf({ ...VIEW_RULES.hanafi, year: "solar" })).toBe("custom");
    });
});
