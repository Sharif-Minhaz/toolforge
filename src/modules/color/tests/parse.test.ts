import { describe, expect, test } from "bun:test";

import { MAX_COLOR_INPUT_LENGTH } from "@/modules/color/domain/constants";
import { hsvToRgb } from "@/modules/color/domain/convert";
import { CSS_NAMED_COLORS } from "@/modules/color/domain/css-colors";
import { parseColor, parseColorOrNull } from "@/modules/color/domain/parse";
import type { ColorSyntax, Rgb } from "@/modules/color/types";

function readRgb(input: string): Rgb {
    const parsed = parseColor(input);

    if (!parsed.ok) {
        throw new Error(`expected ${input} to parse, got ${parsed.reason}`);
    }

    return hsvToRgb(parsed.color);
}

function readAlpha(input: string): number {
    const parsed = parseColor(input);

    if (!parsed.ok) {
        throw new Error(`expected ${input} to parse, got ${parsed.reason}`);
    }

    return parsed.color.a;
}

const VIOLET: Rgb = { r: 124, g: 92, b: 255 };

describe("hex", () => {
    for (const input of ["#7c5cff", "#7C5CFF", "7c5cff", " #7c5cff ", "#7c5cffff"] as const) {
        test(`reads ${input}`, () => {
            expect(readRgb(input)).toEqual(VIOLET);
        });
    }

    test("expands the three-digit shorthand by doubling each digit", () => {
        expect(readRgb("#abc")).toEqual(readRgb("#aabbcc"));
    });

    test("reads the fourth shorthand digit as alpha", () => {
        expect(readAlpha("#abcf")).toBe(1);
        expect(readAlpha("#abc0")).toBe(0);
    });

    test("reads eight-digit alpha to the byte", () => {
        expect(readAlpha("#7c5cff80")).toBeCloseTo(128 / 255, 6);
    });

    for (const input of ["#ab", "#abcde", "#abcdefg", "#zzzzzz"] as const) {
        test(`rejects ${input}`, () => {
            expect(parseColor(input)).toEqual({ ok: false, reason: "unrecognised" });
        });
    }
});

describe("rgb", () => {
    for (const input of [
        "rgb(124, 92, 255)",
        "rgb(124 92 255)",
        "rgba(124, 92, 255, 1)",
        "RGB(124,92,255)",
        "124, 92, 255",
        "124 92 255",
    ] as const) {
        test(`reads ${input}`, () => {
            expect(readRgb(input)).toEqual(VIOLET);
        });
    }

    test("reads percentage channels", () => {
        expect(readRgb("rgb(100%, 0%, 0%)")).toEqual({ r: 255, g: 0, b: 0 });
    });

    for (const [input, alpha] of [
        ["rgba(0, 0, 0, 0.5)", 0.5],
        ["rgb(0 0 0 / 50%)", 0.5],
        ["rgb(0 0 0 / 0.25)", 0.25],
    ] as const) {
        test(`reads the alpha in ${input}`, () => {
            expect(readAlpha(input)).toBeCloseTo(alpha, 6);
        });
    }

    test("clamps an out-of-range channel the way a browser does", () => {
        expect(readRgb("rgb(300, -20, 128)")).toEqual({ r: 255, g: 0, b: 128 });
    });

    for (const input of ["rgb(1, 2)", "rgb(1, 2, 3, 4, 5)", "rgb(a, b, c)"] as const) {
        test(`rejects ${input}`, () => {
            expect(parseColor(input)).toEqual({ ok: false, reason: "unrecognised" });
        });
    }
});

describe("hsl", () => {
    test("reads the comma form", () => {
        expect(readRgb("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0 });
    });

    test("reads the space form with an alpha", () => {
        expect(readRgb("hsl(120 100% 50% / 40%)")).toEqual({ r: 0, g: 255, b: 0 });
        expect(readAlpha("hsl(120 100% 50% / 40%)")).toBeCloseTo(0.4, 6);
    });

    for (const [input, expected] of [
        ["hsl(180deg, 100%, 50%)", { r: 0, g: 255, b: 255 }],
        ["hsl(0.5turn, 100%, 50%)", { r: 0, g: 255, b: 255 }],
        ["hsl(200grad, 100%, 50%)", { r: 0, g: 255, b: 255 }],
    ] as const) {
        test(`reads the angle unit in ${input}`, () => {
            expect(readRgb(input)).toEqual(expected);
        });
    }

    test("wraps a hue past a full turn", () => {
        expect(readRgb("hsl(360, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0 });
        expect(readRgb("hsl(-120, 100%, 50%)")).toEqual({ r: 0, g: 0, b: 255 });
    });
});

describe("hsv", () => {
    for (const name of ["hsv", "hsb"] as const) {
        test(`reads ${name}()`, () => {
            expect(readRgb(`${name}(0, 100%, 100%)`)).toEqual({ r: 255, g: 0, b: 0 });
        });
    }

    test("keeps saturation and value distinct from hsl", () => {
        expect(readRgb("hsv(0, 100%, 50%)")).toEqual({ r: 128, g: 0, b: 0 });
        expect(readRgb("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0 });
    });
});

describe("cmyk", () => {
    test("reads both the percentage and the bare form", () => {
        expect(readRgb("cmyk(0%, 100%, 100%, 0%)")).toEqual({ r: 255, g: 0, b: 0 });
        expect(readRgb("cmyk(0, 100, 100, 0)")).toEqual({ r: 255, g: 0, b: 0 });
    });

    test("stays opaque, because the model has no alpha channel", () => {
        expect(readAlpha("cmyk(0, 0, 0, 0)")).toBe(1);
    });
});

describe("oklch", () => {
    test("reads lightness as a fraction or a percentage", () => {
        expect(readRgb("oklch(0.62796 0.25768 29.234)")).toEqual({ r: 255, g: 0, b: 0 });
        expect(readRgb("oklch(62.796% 0.25768 29.234)")).toEqual({ r: 255, g: 0, b: 0 });
    });

    test("reads an alpha after the slash", () => {
        expect(readAlpha("oklch(0.5 0.1 200 / 30%)")).toBeCloseTo(0.3, 6);
    });

    test("reads a Tailwind palette value verbatim", () => {
        expect(parseColor("oklch(63.7% 0.237 25.331)").ok).toBe(true);
    });
});

describe("css keywords", () => {
    test("reads every keyword back to its own channels", () => {
        for (const named of CSS_NAMED_COLORS) {
            expect(readRgb(named.name)).toEqual({
                r: named.rgb[0],
                g: named.rgb[1],
                b: named.rgb[2],
            });
        }
    });

    test("ignores casing", () => {
        expect(readRgb("RebeccaPurple")).toEqual(readRgb("rebeccapurple"));
    });

    test("reads transparent as fully clear", () => {
        expect(readAlpha("transparent")).toBe(0);
    });
});

describe("reported syntax", () => {
    for (const [input, syntax] of [
        ["#7c5cff", "hex"],
        ["rgb(1 2 3)", "rgb"],
        ["hsl(1 2% 3%)", "hsl"],
        ["hsb(1 2% 3%)", "hsv"],
        ["cmyk(1 2 3 4)", "cmyk"],
        ["oklch(0.5 0.1 200)", "oklch"],
        ["tomato", "named"],
    ] as const satisfies readonly (readonly [string, ColorSyntax])[]) {
        test(`labels ${input} as ${syntax}`, () => {
            const parsed = parseColor(input);

            expect(parsed.ok && parsed.syntax).toBe(syntax);
        });
    }
});

describe("failures", () => {
    for (const input of ["", "   ", "\n"] as const) {
        test(`reports an empty input for ${JSON.stringify(input)}`, () => {
            expect(parseColor(input)).toEqual({ ok: false, reason: "empty" });
        });
    }

    test("reports anything past the ceiling as too long", () => {
        expect(parseColor("#".repeat(MAX_COLOR_INPUT_LENGTH + 1))).toEqual({
            ok: false,
            reason: "too_long",
        });
    });

    test("accepts a value sitting exactly on the ceiling", () => {
        const padded = `${" ".repeat(MAX_COLOR_INPUT_LENGTH - 7)}#7c5cff`;

        expect(parseColor(padded).ok).toBe(true);
    });

    for (const input of ["notacolour", "lab(50% 20 30)", "rgb(1 2 3", "#"] as const) {
        test(`reports ${input} as unrecognised`, () => {
            expect(parseColor(input)).toEqual({ ok: false, reason: "unrecognised" });
        });
    }

    test("parseColorOrNull collapses every failure to null", () => {
        expect(parseColorOrNull("notacolour")).toBeNull();
        expect(parseColorOrNull("#7c5cff")).not.toBeNull();
    });
});
