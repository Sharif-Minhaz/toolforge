import { describe, expect, test } from "bun:test";

import {
    BLACK,
    WHITE,
    checkContrast,
    contrastRatio,
    getContrastReport,
    relativeLuminance,
} from "@/modules/color/domain/contrast";
import { rgbToHsva } from "@/modules/color/domain/convert";
import type { ContrastLevel, Rgb } from "@/modules/color/types";

describe("relativeLuminance", () => {
    test("anchors black at 0 and white at 1", () => {
        expect(relativeLuminance(BLACK)).toBeCloseTo(0, 12);
        expect(relativeLuminance(WHITE)).toBeCloseTo(1, 12);
    });

    test("weights green far above blue, as the coefficients require", () => {
        const green = relativeLuminance({ r: 0, g: 255, b: 0 });
        const blue = relativeLuminance({ r: 0, g: 0, b: 255 });

        expect(green).toBeCloseTo(0.7152, 6);
        expect(blue).toBeCloseTo(0.0722, 6);
    });
});

describe("contrastRatio", () => {
    test("reaches the 21:1 maximum for black against white", () => {
        expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
    });

    test("bottoms out at 1:1 for a colour against itself", () => {
        expect(contrastRatio({ r: 12, g: 34, b: 56 }, { r: 12, g: 34, b: 56 })).toBeCloseTo(1, 10);
    });

    test("does not depend on which colour is named first", () => {
        const a: Rgb = { r: 200, g: 30, b: 90 };
        const b: Rgb = { r: 20, g: 180, b: 240 };

        expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 12);
    });
});

describe("checkContrast", () => {
    for (const [level, foreground, background] of [
        ["aaa", BLACK, WHITE],
        ["aa", BLACK, { r: 130, g: 130, b: 130 }],
        ["aaLarge", BLACK, { r: 105, g: 105, b: 105 }],
        ["fail", WHITE, { r: 250, g: 250, b: 250 }],
    ] as const satisfies readonly (readonly [ContrastLevel, Rgb, Rgb])[]) {
        test(`grades rgb(${background.r} ${background.g} ${background.b}) as ${level}`, () => {
            expect(checkContrast(foreground, background).level).toBe(level);
        });
    }

    test("reports the ratio to two decimals", () => {
        const check = checkContrast(BLACK, { r: 124, g: 92, b: 255 });

        expect(check.ratio).toBe(Math.round(check.ratio * 100) / 100);
    });

    test("never grades a pairing above what its exact ratio earns", () => {
        // The displayed ratio is rounded, so a 4.497 would show as 4.50. The
        // verdict has to come from the value before rounding, every time.
        for (let channel = 0; channel <= 255; channel += 1) {
            const background: Rgb = { r: channel, g: channel, b: channel };
            const exact = contrastRatio(BLACK, background);
            const check = checkContrast(BLACK, background);

            if (check.level === "aaa") {
                expect(exact).toBeGreaterThanOrEqual(7);
            }

            if (check.level === "aa" || check.level === "aaa") {
                expect(exact).toBeGreaterThanOrEqual(4.5);
            }

            if (check.level !== "fail") {
                expect(exact).toBeGreaterThanOrEqual(3);
            }

            expect(check.passesUi).toBe(exact >= 3);
        }
    });

    test("passes the 3:1 non-text floor exactly at the boundary", () => {
        expect(checkContrast(BLACK, { r: 255, g: 255, b: 255 }).passesUi).toBe(true);
        expect(checkContrast(WHITE, { r: 255, g: 255, b: 255 }).passesUi).toBe(false);
    });
});

describe("getContrastReport", () => {
    test("recommends black text on a light colour", () => {
        const report = getContrastReport(rgbToHsva({ r: 250, g: 240, b: 200 }));

        expect(report.bestTextOn).toBe("black");
        expect(report.onBlack.ratio).toBeGreaterThan(report.onWhite.ratio);
    });

    test("recommends white text on a dark colour", () => {
        const report = getContrastReport(rgbToHsva({ r: 20, g: 24, b: 40 }));

        expect(report.bestTextOn).toBe("white");
        expect(report.onWhite.ratio).toBeGreaterThan(report.onBlack.ratio);
    });

    test("ignores alpha, which the tool cannot resolve without a backdrop", () => {
        const opaque = getContrastReport(rgbToHsva({ r: 124, g: 92, b: 255 }, 1));
        const translucent = getContrastReport(rgbToHsva({ r: 124, g: 92, b: 255 }, 0.2));

        expect(translucent).toEqual(opaque);
    });
});
