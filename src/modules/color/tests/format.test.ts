import { describe, expect, test } from "bun:test";

import { hsvToRgb } from "@/modules/color/domain/convert";
import { formatAll, formatColor, toCssColor } from "@/modules/color/domain/format";
import { parseColor } from "@/modules/color/domain/parse";
import type { ColorFormat, ColorFormatOptions, Hsva } from "@/modules/color/types";

const MODERN: ColorFormatOptions = { notation: "modern", hexCasing: "lower" };
const LEGACY: ColorFormatOptions = { notation: "legacy", hexCasing: "lower" };

function color(input: string): Hsva {
    const parsed = parseColor(input);

    if (!parsed.ok) {
        throw new Error(`fixture ${input} does not parse`);
    }

    return parsed.color;
}

const VIOLET = color("#7c5cff");
const TRANSLUCENT = color("rgb(124 92 255 / 50%)");

describe("modern notation", () => {
    for (const [format, expected] of [
        ["hex", "#7c5cff"],
        ["rgb", "rgb(124 92 255)"],
        ["hsl", "hsl(252 100% 68%)"],
        ["hsv", "hsv(252 64% 100%)"],
        ["cmyk", "cmyk(51% 64% 0% 0%)"],
        ["oklch", "oklch(59.9% 0.23 286.205)"],
    ] as const satisfies readonly (readonly [ColorFormat, string])[]) {
        test(`writes ${format} space separated`, () => {
            expect(formatColor(format, VIOLET, MODERN)).toBe(expected);
        });
    }
});

describe("legacy notation", () => {
    for (const [format, expected] of [
        ["rgb", "rgb(124, 92, 255)"],
        ["hsl", "hsl(252, 100%, 68%)"],
        ["hsv", "hsv(252, 64%, 100%)"],
        ["cmyk", "cmyk(51%, 64%, 0%, 0%)"],
    ] as const satisfies readonly (readonly [ColorFormat, string])[]) {
        test(`writes ${format} comma separated`, () => {
            expect(formatColor(format, VIOLET, LEGACY)).toBe(expected);
        });
    }

    test("leaves oklch space separated, because CSS has no comma form for it", () => {
        expect(formatColor("oklch", VIOLET, LEGACY)).toBe(formatColor("oklch", VIOLET, MODERN));
    });
});

describe("alpha", () => {
    test("appends a fourth pair to hex", () => {
        expect(formatColor("hex", TRANSLUCENT, MODERN)).toBe("#7c5cff80");
    });

    test("writes a slash percentage in modern notation", () => {
        expect(formatColor("rgb", TRANSLUCENT, MODERN)).toBe("rgb(124 92 255 / 50%)");
        expect(formatColor("hsl", TRANSLUCENT, MODERN)).toBe("hsl(252 100% 68% / 50%)");
        expect(formatColor("oklch", TRANSLUCENT, MODERN)).toBe("oklch(59.9% 0.23 286.205 / 50%)");
    });

    test("switches to the rgba and hsla spellings in legacy notation", () => {
        expect(formatColor("rgb", TRANSLUCENT, LEGACY)).toBe("rgba(124, 92, 255, 0.5)");
        expect(formatColor("hsl", TRANSLUCENT, LEGACY)).toBe("hsla(252, 100%, 68%, 0.5)");
    });

    test("drops it from cmyk, and says so", () => {
        const rows = formatAll(TRANSLUCENT, MODERN);
        const cmyk = rows.find((row) => row.format === "cmyk");

        expect(cmyk?.value).toBe("cmyk(51% 64% 0% 0%)");
        expect(cmyk?.alphaDropped).toBe(true);
    });

    test("reports no drop while the colour is opaque", () => {
        expect(formatAll(VIOLET, MODERN).every((row) => !row.alphaDropped)).toBe(true);
    });

    test("keeps a fully clear colour readable rather than collapsing it", () => {
        expect(formatColor("hex", color("transparent"), MODERN)).toBe("#00000000");
        expect(formatColor("rgb", color("transparent"), MODERN)).toBe("rgb(0 0 0 / 0%)");
    });
});

describe("hex casing", () => {
    test("uppercases the digits and keeps the hash", () => {
        expect(formatColor("hex", VIOLET, { ...MODERN, hexCasing: "upper" })).toBe("#7C5CFF");
    });

    test("does not touch any other format", () => {
        expect(formatColor("rgb", VIOLET, { ...MODERN, hexCasing: "upper" })).toBe(
            "rgb(124 92 255)",
        );
    });
});

describe("formatAll", () => {
    test("lists every format once, in catalogue order", () => {
        expect(formatAll(VIOLET, MODERN).map((row) => row.format)).toEqual([
            "hex",
            "rgb",
            "hsl",
            "hsv",
            "cmyk",
            "oklch",
        ]);
    });

    test("every row it writes parses back to the colour it came from", () => {
        const original = hsvToRgb(VIOLET);

        for (const row of formatAll(VIOLET, MODERN)) {
            const reparsed = parseColor(row.value);

            expect(reparsed.ok).toBe(true);

            if (!reparsed.ok) {
                continue;
            }

            const rgb = hsvToRgb(reparsed.color);

            if (row.format === "hex" || row.format === "rgb") {
                expect(rgb).toEqual(original);

                continue;
            }

            // The other four round their channels to whole units for display,
            // so a reading can land one step away.
            for (const channel of ["r", "g", "b"] as const) {
                expect(Math.abs(rgb[channel] - original[channel])).toBeLessThanOrEqual(2);
            }
        }
    });
});

describe("toCssColor", () => {
    test("always writes hex, whatever the reading notation is", () => {
        expect(toCssColor(VIOLET)).toBe("#7c5cff");
        expect(toCssColor(TRANSLUCENT)).toBe("#7c5cff80");
    });
});
