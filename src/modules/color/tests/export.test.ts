import { describe, expect, test } from "bun:test";

import { buildColorExportFilename, createColorExportFile } from "@/modules/color/domain/export";
import { parseColor } from "@/modules/color/domain/parse";
import { COLOR_SCALE_STEPS, type ColorFormatOptions, type Hsva } from "@/modules/color/types";

const GENERATED_AT = new Date("2026-07-29T10:15:00.000Z");

const OPTIONS: ColorFormatOptions = { notation: "modern", hexCasing: "lower" };

function color(input: string): Hsva {
    const parsed = parseColor(input);

    if (!parsed.ok) {
        throw new Error(`fixture ${input} does not parse`);
    }

    return parsed.color;
}

describe("buildColorExportFilename", () => {
    test("names the file after the colour and the moment", () => {
        expect(buildColorExportFilename("#7c5cff", GENERATED_AT)).toBe(
            "color-7c5cff-20260729T101500Z.css",
        );
    });

    test("normalises an uppercase hex, so the name stays predictable", () => {
        expect(buildColorExportFilename("#7C5CFF", GENERATED_AT)).toBe(
            "color-7c5cff-20260729T101500Z.css",
        );
    });
});

describe("createColorExportFile", () => {
    const file = createColorExportFile({
        color: color("#7c5cff"),
        options: OPTIONS,
        generatedAt: GENERATED_AT,
    });

    test("bundles filename, media type, and body together", () => {
        expect(file.filename).toBe("color-7c5cff-20260729T101500Z.css");
        expect(file.mimeType).toBe("text/css;charset=utf-8");
    });

    test("opens with the other notations as a comment", () => {
        expect(file.content).toStartWith("/*\n * #7c5cff\n");
        expect(file.content).toContain(" * rgb   rgb(124 92 255)");
        expect(file.content).toContain(" * oklch oklch(59.9% 0.23 286.205)");
    });

    test("declares the base colour and one custom property per scale step", () => {
        expect(file.content).toContain("    --color-brand: #7c5cff;");

        for (const step of COLOR_SCALE_STEPS) {
            expect(file.content).toMatch(new RegExp(`--color-brand-${step}: #[0-9a-f]{6};`));
        }
    });

    test("ends with a newline, as a stylesheet should", () => {
        expect(file.content).toEndWith("}\n");
    });

    test("follows the notation the user is reading", () => {
        const legacy = createColorExportFile({
            color: color("#7c5cff"),
            options: { notation: "legacy", hexCasing: "upper" },
            generatedAt: GENERATED_AT,
        });

        expect(legacy.content).toContain(" * rgb   rgb(124, 92, 255)");
        expect(legacy.content).toContain("    --color-brand: #7C5CFF;");
    });
});
