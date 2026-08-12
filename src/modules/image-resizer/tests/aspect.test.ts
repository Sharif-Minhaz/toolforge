import { describe, expect, test } from "bun:test";

import {
    cropRatio,
    formatRatio,
    parseAspectText,
    ratioForPreset,
    ratioValue,
    reduceRatio,
} from "@/modules/image-resizer/domain/aspect";

describe("reduceRatio", () => {
    test("reduces a screen size to the shape people say", () => {
        expect(reduceRatio(1920, 1080)).toEqual({ width: 16, height: 9 });
        expect(reduceRatio(800, 600)).toEqual({ width: 4, height: 3 });
        expect(reduceRatio(1000, 1000)).toEqual({ width: 1, height: 1 });
    });

    test("refuses to round a shape that is only nearly a familiar one", () => {
        // 1000 × 667 is *nearly* 3:2, and reporting it as 3:2 would be a label
        // the reader can then lock the crop to and get a different crop.
        expect(reduceRatio(1000, 667)).toEqual({ width: 1000, height: 667 });
    });
});

describe("parseAspectText", () => {
    test("reads the three spellings people actually type", () => {
        expect(parseAspectText("16:9")).toEqual({ width: 16, height: 9 });
        expect(parseAspectText("16/9")).toEqual({ width: 16, height: 9 });
        expect(parseAspectText("16 x 9")).toEqual({ width: 16, height: 9 });
        expect(parseAspectText("1.5")).toEqual({ width: 1.5, height: 1 });
    });

    test("reads decimals on either side", () => {
        expect(parseAspectText("4.5:3.5")).toEqual({ width: 4.5, height: 3.5 });
    });

    test("tolerates the spaces a person leaves", () => {
        expect(parseAspectText("  16 : 9  ")).toEqual({ width: 16, height: 9 });
    });

    test("refuses a shape that has no crop", () => {
        expect(parseAspectText("0:1")).toBeNull();
        expect(parseAspectText("1:0")).toBeNull();
        expect(parseAspectText("-16:9")).toBeNull();
        expect(parseAspectText("wide")).toBeNull();
        expect(parseAspectText("")).toBeNull();
    });
});

describe("formatRatio", () => {
    test("labels a whole-number pair reduced", () => {
        expect(formatRatio({ width: 1920, height: 1080 })).toBe("16:9");
    });

    test("keeps a decimal pair as it was given", () => {
        expect(formatRatio({ width: 1.5, height: 1 })).toBe("1.5:1");
    });
});

describe("ratioForPreset", () => {
    const source = { width: 1600, height: 900 };

    test("free is no constraint at all", () => {
        expect(ratioForPreset("free", source, null)).toBeNull();
    });

    test("original comes from the picture", () => {
        expect(ratioForPreset("original", source, null)).toBeCloseTo(16 / 9, 6);
    });

    test("the fixed entries are the shapes on the picker", () => {
        expect(ratioForPreset("1:1", source, null)).toBe(1);
        expect(ratioForPreset("4:3", source, null)).toBeCloseTo(4 / 3, 6);
        expect(ratioForPreset("9:16", source, null)).toBeCloseTo(9 / 16, 6);
    });

    test("custom comes from what the reader typed, and is free until they do", () => {
        expect(ratioForPreset("custom", source, { width: 45, height: 55 })).toBeCloseTo(45 / 55, 6);
        expect(ratioForPreset("custom", source, null)).toBeNull();
    });
});

describe("cropRatio and ratioValue", () => {
    test("report the shape of a box", () => {
        expect(cropRatio({ x: 0, y: 0, width: 300, height: 200 })).toBeCloseTo(1.5, 6);
        expect(ratioValue({ width: 45, height: 55 })).toBeCloseTo(0.8181, 3);
    });
});
