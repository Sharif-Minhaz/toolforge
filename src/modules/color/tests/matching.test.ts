import { describe, expect, test } from "bun:test";

import { rgbToHsva } from "@/modules/color/domain/convert";
import { CSS_NAMED_COLORS } from "@/modules/color/domain/css-colors";
import {
    findClosestCssColor,
    findClosestTailwindColor,
    getCssNamedSwatches,
    getTailwindFamilies,
    getTailwindSwatches,
} from "@/modules/color/domain/matching";
import { parseColor } from "@/modules/color/domain/parse";
import { TAILWIND_SWATCHES } from "@/modules/color/domain/tailwind-palette";
import type { Hsva } from "@/modules/color/types";

function color(input: string): Hsva {
    const parsed = parseColor(input);

    if (!parsed.ok) {
        throw new Error(`fixture ${input} does not parse`);
    }

    return parsed.color;
}

describe("the resolved Tailwind palette", () => {
    test("resolves every swatch the generated table holds", () => {
        expect(getTailwindSwatches()).toHaveLength(TAILWIND_SWATCHES.length);
    });

    test("gives each swatch a six-digit lower-case hex", () => {
        for (const swatch of getTailwindSwatches()) {
            expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    test("resolves black and white exactly", () => {
        const byName = new Map(getTailwindSwatches().map((swatch) => [swatch.name, swatch.hex]));

        expect(byName.get("black")).toBe("#000000");
        expect(byName.get("white")).toBe("#ffffff");
    });

    test("groups swatches into families without losing or duplicating any", () => {
        const grouped = getTailwindFamilies().flatMap((group) => group.swatches);

        expect(grouped).toHaveLength(TAILWIND_SWATCHES.length);
        expect(new Set(grouped.map((swatch) => swatch.name)).size).toBe(grouped.length);
    });

    test("gives every family at least one swatch", () => {
        for (const group of getTailwindFamilies()) {
            expect(group.swatches.length).toBeGreaterThan(0);
        }
    });
});

describe("findClosestTailwindColor", () => {
    test("returns a swatch exactly when handed its own hex", () => {
        // Compared by channels rather than by name: several families round to
        // the same 8-bit value — `zinc-50`, `neutral-50`, and `mauve-50` are all
        // #fafafa — so which of them wins a tie is not the property under test.
        for (const swatch of getTailwindSwatches()) {
            const match = findClosestTailwindColor(rgbToHsva(swatch.rgb));

            expect(match.rgb).toEqual(swatch.rgb);
            expect(match.exact).toBe(true);
            expect(match.distance).toBeLessThan(1e-9);
        }
    });

    test("finds black for pure black and white for pure white", () => {
        expect(findClosestTailwindColor(color("#000000")).name).toBe("black");
        expect(findClosestTailwindColor(color("#ffffff")).name).toBe("white");
    });

    test("reports a near miss as close but not exact", () => {
        const red500 = getTailwindSwatches().find((swatch) => swatch.name === "red-500");

        if (red500 === undefined) {
            throw new Error("palette is missing red-500");
        }

        const nudged = findClosestTailwindColor(
            rgbToHsva({ r: red500.rgb.r, g: red500.rgb.g, b: Math.min(255, red500.rgb.b + 40) }),
        );

        expect(nudged.exact).toBe(false);
        expect(nudged.distance).toBeGreaterThan(0);
    });
});

describe("findClosestCssColor", () => {
    test("returns a keyword exactly when handed its own channels", () => {
        for (const named of CSS_NAMED_COLORS) {
            const match = findClosestCssColor(
                rgbToHsva({ r: named.rgb[0], g: named.rgb[1], b: named.rgb[2] }),
            );

            expect(match.exact).toBe(true);
            expect(match.rgb).toEqual({ r: named.rgb[0], g: named.rgb[1], b: named.rgb[2] });
        }
    });

    test("exposes every keyword to the palette browser", () => {
        expect(getCssNamedSwatches()).toHaveLength(CSS_NAMED_COLORS.length);
    });
});
