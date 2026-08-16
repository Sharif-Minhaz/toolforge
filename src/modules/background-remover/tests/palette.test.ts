import { describe, expect, test } from "bun:test";

import { parseHexColor } from "../domain/background";
import {
    BACKGROUND_SWATCHES,
    needsSwatchOutline,
    relativeLuminance,
    SWATCH_NAMES,
    SWATCHES,
} from "../domain/palette";

describe("the swatch list", () => {
    test("every swatch is a colour the compositor can actually paint with", () => {
        // The canvas takes `fillStyle` as a string and silently ignores one it
        // cannot parse, which paints nothing and looks like a broken button.
        for (const swatch of BACKGROUND_SWATCHES) {
            expect(parseHexColor(swatch)).toBe(swatch);
        }
    });

    test("names and colours are the same length, so the pairing cannot slip", () => {
        expect(SWATCH_NAMES.length).toBe(BACKGROUND_SWATCHES.length);
        expect(SWATCHES.length).toBe(BACKGROUND_SWATCHES.length);
    });

    test("pairs each name with the colour at its own index", () => {
        SWATCHES.forEach((swatch, index) => {
            expect(swatch.name).toBe(SWATCH_NAMES[index]);
            expect(swatch.color).toBe(BACKGROUND_SWATCHES[index]);
        });
    });

    test("no colour appears twice — two identical tiles is a picker that looks broken", () => {
        expect(new Set(BACKGROUND_SWATCHES).size).toBe(BACKGROUND_SWATCHES.length);
    });

    test("no name appears twice, because each one is a message key", () => {
        expect(new Set(SWATCH_NAMES).size).toBe(SWATCH_NAMES.length);
    });
});

describe("relativeLuminance", () => {
    test("matches the WCAG endpoints", () => {
        expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
        expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
    });

    test("weights green most heavily, per the sRGB coefficients", () => {
        expect(relativeLuminance("#00ff00")).toBeGreaterThan(relativeLuminance("#ff0000"));
        expect(relativeLuminance("#ff0000")).toBeGreaterThan(relativeLuminance("#0000ff"));
    });

    test("an unparseable colour reads as black rather than throwing", () => {
        expect(relativeLuminance("nonsense")).toBe(0);
    });
});

describe("needsSwatchOutline", () => {
    test("near-white and near-black tiles are outlined", () => {
        expect(needsSwatchOutline("#ffffff")).toBe(true);
        expect(needsSwatchOutline("#111111")).toBe(true);
    });

    test("a mid-tone tile is not", () => {
        expect(needsSwatchOutline("#3b5bdb")).toBe(false);
        expect(needsSwatchOutline("#f5b301")).toBe(false);
    });
});
