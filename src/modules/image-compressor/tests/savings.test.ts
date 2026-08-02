import { describe, expect, test } from "bun:test";

import { savingsPercent, summariseSavings } from "@/modules/image-compressor/domain/savings";

describe("savingsPercent", () => {
    test("reports the share of the original that went", () => {
        expect(savingsPercent({ originalBytes: 1000, outputBytes: 460 })).toBe(54);
    });

    test("reports a growth as a negative number rather than as zero", () => {
        expect(savingsPercent({ originalBytes: 1000, outputBytes: 1200 })).toBe(-20);
    });

    test("an unchanged size is zero", () => {
        expect(savingsPercent({ originalBytes: 1000, outputBytes: 1000 })).toBe(0);
    });

    test("an empty original cannot be divided by, and reports zero", () => {
        expect(savingsPercent({ originalBytes: 0, outputBytes: 0 })).toBe(0);
        expect(savingsPercent({ originalBytes: 0, outputBytes: 100 })).toBe(0);
    });

    test("rounds to a whole percent", () => {
        expect(savingsPercent({ originalBytes: 1000, outputBytes: 995 })).toBe(1);
        expect(savingsPercent({ originalBytes: 1000, outputBytes: 996 })).toBe(0);
    });
});

describe("summariseSavings", () => {
    test("an empty batch reports zeroes instead of dividing by none", () => {
        expect(summariseSavings([])).toEqual({
            count: 0,
            originalBytes: 0,
            outputBytes: 0,
            savedBytes: 0,
            percent: 0,
        });
    });

    test("totals every pair and derives the percentage from the totals", () => {
        const summary = summariseSavings([
            { originalBytes: 1000, outputBytes: 400 },
            { originalBytes: 3000, outputBytes: 1600 },
        ]);

        expect(summary).toEqual({
            count: 2,
            originalBytes: 4000,
            outputBytes: 2000,
            savedBytes: 2000,
            percent: 50,
        });
    });

    test("a batch percentage is weighted by size, not averaged per file", () => {
        // 90% off a tiny file and 0% off a huge one is not a 45% saving.
        const summary = summariseSavings([
            { originalBytes: 100, outputBytes: 10 },
            { originalBytes: 9900, outputBytes: 9900 },
        ]);

        expect(summary.percent).toBe(1);
    });

    test("a batch that grew reports a negative saving", () => {
        const summary = summariseSavings([{ originalBytes: 500, outputBytes: 750 }]);

        expect(summary.savedBytes).toBe(-250);
        expect(summary.percent).toBe(-50);
    });
});
