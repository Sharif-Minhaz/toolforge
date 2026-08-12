import { describe, expect, test } from "bun:test";

import {
    MAX_DIMENSION,
    MAX_DPI,
    MIN_DIMENSION,
    MIN_DPI,
} from "@/modules/image-resizer/domain/constants";
import {
    clampDpi,
    decimalsForUnit,
    fromPixels,
    isPhysicalUnit,
    MM_PER_INCH,
    roundForUnit,
    toPixels,
} from "@/modules/image-resizer/domain/units";

describe("toPixels", () => {
    test("passes pixels through", () => {
        expect(toPixels(1200, "px", 300)).toBe(1200);
    });

    test("ignores the resolution for pixels", () => {
        expect(toPixels(1200, "px", 72)).toBe(1200);
        expect(toPixels(1200, "px", 600)).toBe(1200);
    });

    test("measures a Bangladeshi passport photo at 300 DPI", () => {
        // 45 mm = 1.7716… in × 300 = 531.49…, and 55 mm = 2.1653… in × 300.
        expect(toPixels(45, "mm", 300)).toBe(531);
        expect(toPixels(55, "mm", 300)).toBe(650);
    });

    test("doubles it at 600 DPI, which is the reason DPI is not a constant", () => {
        expect(toPixels(45, "mm", 600)).toBe(1063);
        expect(toPixels(55, "mm", 600)).toBe(1299);
    });

    test("measures a US passport photo", () => {
        expect(toPixels(2, "in", 300)).toBe(600);
    });

    test("agrees with itself across the three physical units", () => {
        // One inch is 25.4 mm is 2.54 cm, by definition rather than measurement.
        expect(toPixels(1, "in", 300)).toBe(toPixels(MM_PER_INCH, "mm", 300));
        expect(toPixels(1, "in", 300)).toBe(toPixels(2.54, "cm", 300));
    });

    test("floors at one pixel rather than producing a zero-height image", () => {
        expect(toPixels(0.001, "mm", 72)).toBe(MIN_DIMENSION);
    });

    test("refuses a nonsensical length", () => {
        expect(toPixels(0, "px", 300)).toBe(MIN_DIMENSION);
        expect(toPixels(-5, "px", 300)).toBe(MIN_DIMENSION);
        expect(toPixels(Number.NaN, "px", 300)).toBe(MIN_DIMENSION);
    });

    test("caps what a held-down key can produce", () => {
        expect(toPixels(9_999_999, "px", 300)).toBe(MAX_DIMENSION);
    });
});

describe("fromPixels", () => {
    test("round-trips a physical length without the rounding error", () => {
        const pixels = toPixels(45, "mm", 300);

        expect(fromPixels(pixels, "mm", 300)).toBeCloseTo(44.958, 3);
    });

    test("returns pixels unchanged", () => {
        expect(fromPixels(800, "px", 300)).toBe(800);
    });

    test("reports zero for nothing rather than a negative length", () => {
        expect(fromPixels(0, "mm", 300)).toBe(0);
        expect(fromPixels(-4, "mm", 300)).toBe(0);
    });
});

describe("clampDpi", () => {
    test("keeps a sensible resolution", () => {
        expect(clampDpi(300)).toBe(300);
    });

    test("bounds both ends and rounds", () => {
        expect(clampDpi(0)).toBe(MIN_DPI);
        expect(clampDpi(1e9)).toBe(MAX_DPI);
        expect(clampDpi(299.6)).toBe(300);
        expect(clampDpi(Number.NaN)).toBe(MIN_DPI);
    });
});

describe("units", () => {
    test("knows which units need a resolution", () => {
        expect(isPhysicalUnit("px")).toBe(false);
        expect(isPhysicalUnit("mm")).toBe(true);
        expect(isPhysicalUnit("cm")).toBe(true);
        expect(isPhysicalUnit("in")).toBe(true);
    });

    test("shows no decimals on a pixel and two on an inch", () => {
        expect(decimalsForUnit("px")).toBe(0);
        expect(decimalsForUnit("mm")).toBe(1);
        expect(decimalsForUnit("in")).toBe(2);
        expect(roundForUnit(1.77165, "in")).toBe(1.77);
        expect(roundForUnit(44.958, "mm")).toBe(45);
        expect(roundForUnit(531.4, "px")).toBe(531);
    });
});
