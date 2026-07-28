import { describe, expect, test } from "bun:test";

import { relativeLuminance } from "@/modules/color/domain/contrast";
import { hsvToRgb, rgbToHsva, rgbToOklch } from "@/modules/color/domain/convert";
import { parseColor } from "@/modules/color/domain/parse";
import { buildColorScale } from "@/modules/color/domain/scale";
import { COLOR_SCALE_STEPS, type ColorFormatOptions, type Hsva } from "@/modules/color/types";

const OPTIONS: ColorFormatOptions = { notation: "modern", hexCasing: "lower" };

function color(input: string): Hsva {
    const parsed = parseColor(input);

    if (!parsed.ok) {
        throw new Error(`fixture ${input} does not parse`);
    }

    return parsed.color;
}

const VIOLET = color("#7c5cff");

describe("buildColorScale", () => {
    test("emits every Tailwind step once, in order", () => {
        expect(buildColorScale(VIOLET, OPTIONS).map((stop) => stop.step)).toEqual([
            ...COLOR_SCALE_STEPS,
        ]);
    });

    test("darkens monotonically from 50 to 950", () => {
        const luminance = buildColorScale(VIOLET, OPTIONS).map((stop) =>
            relativeLuminance(stop.rgb),
        );

        for (const [index, value] of luminance.entries()) {
            if (index === 0) {
                continue;
            }

            expect(value).toBeLessThan(luminance[index - 1]);
        }
    });

    test("marks exactly one stop as the base", () => {
        expect(buildColorScale(VIOLET, OPTIONS).filter((stop) => stop.isBase)).toHaveLength(1);
    });

    test("marks the stop whose lightness is nearest the picked colour", () => {
        // #7c5cff sits at 0.599 OKLCH lightness, nearer the 600 rung (0.577)
        // than the 500 one (0.637).
        const base = buildColorScale(VIOLET, OPTIONS).find((stop) => stop.isBase);

        expect(base?.step).toBe("600");
    });

    test("moves the base marker when the colour is much lighter", () => {
        const base = buildColorScale(color("#faf5ff"), OPTIONS).find((stop) => stop.isBase);

        expect(base?.step).toBe("50");
    });

    test("holds the hue steady across the whole ladder", () => {
        const green = color("#2f8f5b");
        const hue = rgbToOklch(hsvToRgb(green)).h;

        for (const stop of buildColorScale(green, OPTIONS)) {
            // The near-white and near-black ends carry almost no chroma, where
            // hue stops being meaningful, so they are exempt.
            if (rgbToOklch(stop.rgb).c < 0.02) {
                continue;
            }

            expect(Math.abs(rgbToOklch(stop.rgb).h - hue)).toBeLessThan(3);
        }
    });

    test("writes each stop's hex in the requested casing", () => {
        const upper = buildColorScale(VIOLET, { ...OPTIONS, hexCasing: "upper" });

        for (const stop of upper) {
            expect(stop.hex).toBe(stop.hex.toUpperCase());
        }
    });

    test("keeps every stop inside sRGB, even from a fully saturated colour", () => {
        for (const stop of buildColorScale(rgbToHsva({ r: 0, g: 255, b: 0 }), OPTIONS)) {
            for (const channel of [stop.rgb.r, stop.rgb.g, stop.rgb.b]) {
                expect(channel).toBeGreaterThanOrEqual(0);
                expect(channel).toBeLessThanOrEqual(255);
                expect(Number.isInteger(channel)).toBe(true);
            }
        }
    });

    test("produces a grey ladder from a grey, rather than inventing a hue", () => {
        for (const stop of buildColorScale(rgbToHsva({ r: 128, g: 128, b: 128 }), OPTIONS)) {
            expect(stop.rgb.r).toBe(stop.rgb.g);
            expect(stop.rgb.g).toBe(stop.rgb.b);
        }
    });
});
