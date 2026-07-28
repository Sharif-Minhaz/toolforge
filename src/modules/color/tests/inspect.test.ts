import { describe, expect, test } from "bun:test";

import { DEFAULT_COLOR, DEFAULT_FORMAT_OPTIONS } from "@/modules/color/domain/constants";
import { inspectColor } from "@/modules/color/domain/inspect";
import { parseColor } from "@/modules/color/domain/parse";
import { randomColor } from "@/modules/color/domain/random";
import { COLOR_FORMATS, COLOR_SCALE_STEPS } from "@/modules/color/types";

describe("inspectColor", () => {
    const inspection = inspectColor(DEFAULT_COLOR, DEFAULT_FORMAT_OPTIONS);

    test("derives every panel the workbench renders", () => {
        expect(inspection.formats).toHaveLength(COLOR_FORMATS.length);
        expect(inspection.scale).toHaveLength(COLOR_SCALE_STEPS.length);
        expect(inspection.css).toMatch(/^#[0-9a-f]{6}$/);
        expect(inspection.tailwind.name).not.toHaveLength(0);
        expect(inspection.cssName.name).not.toHaveLength(0);
    });

    test("is deterministic, so the server pass and hydration agree", () => {
        expect(inspectColor(DEFAULT_COLOR, DEFAULT_FORMAT_OPTIONS)).toEqual(inspection);
    });

    test("keeps the colour it was handed", () => {
        expect(inspection.color).toEqual(DEFAULT_COLOR);
    });
});

describe("randomColor", () => {
    test("takes its numbers from the source it is given", () => {
        const values = [0.5, 0.25, 0.75];
        let index = 0;

        const color = randomColor(() => values[index++ % values.length]);

        expect(color).toEqual({ h: 180, s: 45 + 0.25 * 50, v: 55 + 0.75 * 45, a: 1 });
    });

    test("stays inside the picker's ranges at both extremes of the source", () => {
        for (const value of [0, 0.999999] as const) {
            const color = randomColor(() => value);

            expect(color.h).toBeGreaterThanOrEqual(0);
            expect(color.h).toBeLessThan(360);
            expect(color.s).toBeGreaterThanOrEqual(0);
            expect(color.s).toBeLessThanOrEqual(100);
            expect(color.v).toBeGreaterThanOrEqual(0);
            expect(color.v).toBeLessThanOrEqual(100);
            expect(color.a).toBe(1);
        }
    });

    test("never lands on a washed-out grey", () => {
        for (const value of [0, 0.5, 0.999999] as const) {
            expect(randomColor(() => value).s).toBeGreaterThanOrEqual(45);
        }
    });
});

describe("the default colour", () => {
    test("survives a round trip through the formatted hex", () => {
        const hex = inspectColor(DEFAULT_COLOR, DEFAULT_FORMAT_OPTIONS).formats[0].value;
        const reparsed = parseColor(hex);

        expect(reparsed.ok).toBe(true);
        expect(reparsed.ok && inspectColor(reparsed.color, DEFAULT_FORMAT_OPTIONS).css).toBe(
            inspectColor(DEFAULT_COLOR, DEFAULT_FORMAT_OPTIONS).css,
        );
    });
});
