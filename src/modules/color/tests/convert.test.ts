import { describe, expect, test } from "bun:test";

import {
    clampChromaToGamut,
    cmykToRgb,
    hslToRgb,
    hsvToHsl,
    hsvToRgb,
    isInSrgbGamut,
    normalizeHue,
    oklchToRgb,
    rgbToCmyk,
    rgbToHsl,
    rgbToHsv,
    rgbToOklch,
    roundOklch,
} from "@/modules/color/domain/convert";
import type { Rgb } from "@/modules/color/types";

/**
 * A deterministic spread of colours, so the round-trip properties below cover
 * more than a handful of hand-picked values without depending on a clock or a
 * random source.
 */
function* sampleColors(): Generator<Rgb> {
    let seed = 20260729;

    for (let index = 0; index < 600; index += 1) {
        const next = () => {
            seed = (seed * 1103515245 + 12345) % 2147483648;

            return seed % 256;
        };

        yield { r: next(), g: next(), b: next() };
    }
}

describe("normalizeHue", () => {
    for (const [input, expected] of [
        [0, 0],
        [360, 0],
        [-30, 330],
        [400, 40],
        [-400, 320],
    ] as const) {
        test(`wraps ${input} to ${expected}`, () => {
            expect(normalizeHue(input)).toBeCloseTo(expected, 10);
        });
    }
});

describe("rgb ↔ hsv", () => {
    test("reads the primaries at full saturation and value", () => {
        expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 });
        expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, v: 100 });
        expect(rgbToHsv({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, v: 100 });
    });

    test("reports black and white as unsaturated", () => {
        expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
        expect(rgbToHsv({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, v: 100 });
    });

    test("round-trips every sample channel for channel", () => {
        for (const rgb of sampleColors()) {
            expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb);
        }
    });
});

describe("rgb ↔ hsl", () => {
    test("puts a mid grey at half lightness with no saturation", () => {
        const hsl = rgbToHsl({ r: 128, g: 128, b: 128 });

        expect(hsl.s).toBeCloseTo(0, 10);
        expect(hsl.l).toBeCloseTo(50.196, 3);
    });

    test("round-trips every sample channel for channel", () => {
        for (const rgb of sampleColors()) {
            expect(hslToRgb(rgbToHsl(rgb))).toEqual(rgb);
        }
    });

    test("drops saturation at both ends of the lightness axis", () => {
        expect(hsvToHsl({ h: 200, s: 100, v: 0 })).toEqual({ h: 200, s: 0, l: 0 });
        expect(hsvToHsl({ h: 200, s: 0, v: 100 })).toEqual({ h: 200, s: 0, l: 100 });
    });
});

describe("rgb ↔ cmyk", () => {
    test("separates the primaries into a single colourant", () => {
        expect(rgbToCmyk({ r: 255, g: 0, b: 0 })).toEqual({ c: 0, m: 100, y: 100, k: 0 });
        expect(rgbToCmyk({ r: 0, g: 255, b: 255 })).toEqual({ c: 100, m: 0, y: 0, k: 0 });
    });

    test("puts pure black entirely in the key channel", () => {
        expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    });

    test("round-trips every sample channel for channel", () => {
        for (const rgb of sampleColors()) {
            expect(cmykToRgb(rgbToCmyk(rgb))).toEqual(rgb);
        }
    });
});

describe("rgb ↔ oklch", () => {
    /**
     * The values CSS Color Module 4 publishes for the sRGB primaries. They pin
     * the transcribed matrices: a single mistyped digit moves these well past
     * the tolerance.
     */
    for (const [label, rgb, l, c, h] of [
        ["white", { r: 255, g: 255, b: 255 }, 1, 0, undefined],
        ["black", { r: 0, g: 0, b: 0 }, 0, 0, undefined],
        ["red", { r: 255, g: 0, b: 0 }, 0.62796, 0.25768, 29.234],
        ["green", { r: 0, g: 255, b: 0 }, 0.86644, 0.29483, 142.495],
        ["blue", { r: 0, g: 0, b: 255 }, 0.45201, 0.31321, 264.052],
    ] as const) {
        test(`matches the published coordinates for ${label}`, () => {
            const oklch = rgbToOklch(rgb);

            expect(oklch.l).toBeCloseTo(l, 4);
            expect(oklch.c).toBeCloseTo(c, 4);

            if (h !== undefined) {
                expect(oklch.h).toBeCloseTo(h, 2);
            }
        });
    }

    test("round-trips every sample channel for channel", () => {
        for (const rgb of sampleColors()) {
            expect(oklchToRgb(rgbToOklch(rgb))).toEqual(rgb);
        }
    });

    test("rounds the way Tailwind writes its own palette", () => {
        expect(roundOklch({ l: 0.63712, c: 0.23745, h: 25.3312 })).toEqual({
            l: 63.7,
            c: 0.237,
            h: 25.331,
        });
    });
});

describe("clampChromaToGamut", () => {
    test("leaves a colour that already fits alone", () => {
        const inside = rgbToOklch({ r: 124, g: 92, b: 255 });

        expect(clampChromaToGamut(inside)).toEqual(inside);
    });

    test("pulls an impossible chroma back until sRGB can show it", () => {
        const outside = { l: 0.95, c: 0.4, h: 250 };

        expect(isInSrgbGamut(outside)).toBe(false);

        const clamped = clampChromaToGamut(outside);

        expect(isInSrgbGamut(clamped)).toBe(true);
        expect(clamped.c).toBeLessThan(outside.c);
        expect(clamped.l).toBe(outside.l);
        expect(clamped.h).toBe(outside.h);
    });

    test("keeps the hue it was given, unlike clipping the channels", () => {
        const clamped = clampChromaToGamut({ l: 0.55, c: 0.38, h: 145 });

        expect(rgbToOklch(oklchToRgb(clamped)).h).toBeCloseTo(145, 0);
    });
});
