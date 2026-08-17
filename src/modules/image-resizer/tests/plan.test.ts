import { describe, expect, test } from "bun:test";

import { DEFAULT_OPTIONS, MAX_OUTPUT_PIXELS } from "@/modules/image-resizer/domain/constants";
import {
    copiesPixels,
    isOutputTooLarge,
    isPlanTooLarge,
    parseHexColor,
    planRender,
    targetSize,
} from "@/modules/image-resizer/domain/plan";
import type { CropRect, ResizeOptions } from "@/modules/image-resizer/types";

const CROP: CropRect = { x: 0, y: 0, width: 1000, height: 500 };

function options(patch: Partial<ResizeOptions> = {}): ResizeOptions {
    return { ...DEFAULT_OPTIONS, ...patch };
}

describe("parseHexColor", () => {
    test("reads both spellings, with or without the hash", () => {
        expect(parseHexColor("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
        expect(parseHexColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
        expect(parseHexColor("336699")).toEqual({ r: 0x33, g: 0x66, b: 0x99 });
        expect(parseHexColor("#F0A")).toEqual({ r: 255, g: 0, b: 170 });
    });

    test("falls back to white rather than to black", () => {
        // A half-typed colour becoming black is how a document photo comes out
        // with a black background, which is a rejected form.
        expect(parseHexColor("#ff")).toEqual({ r: 255, g: 255, b: 255 });
        expect(parseHexColor("rebeccapurple")).toEqual({ r: 255, g: 255, b: 255 });
        expect(parseHexColor("")).toEqual({ r: 255, g: 255, b: 255 });
    });
});

describe("targetSize — dimensions", () => {
    test("keeps the crop when neither side is given", () => {
        expect(targetSize(CROP, options({ mode: "dimensions" }))).toEqual({
            width: 1000,
            height: 500,
        });
    });

    test("derives the other side from the crop with the lock on", () => {
        expect(targetSize(CROP, options({ mode: "dimensions", width: 600 }))).toEqual({
            width: 600,
            height: 300,
        });
        expect(targetSize(CROP, options({ mode: "dimensions", height: 250 }))).toEqual({
            width: 500,
            height: 250,
        });
    });

    test("derives from the crop rather than from the source", () => {
        // Using the picture's own shape here would letterboard every photograph
        // the reader had just cropped.
        const tall: CropRect = { x: 0, y: 0, width: 400, height: 800 };

        expect(targetSize(tall, options({ mode: "dimensions", width: 200 }))).toEqual({
            width: 200,
            height: 400,
        });
    });

    test("keeps the crop's other side with the lock off", () => {
        expect(
            targetSize(CROP, options({ mode: "dimensions", width: 600, lockAspect: false })),
        ).toEqual({ width: 600, height: 500 });
    });

    test("honours both sides when both are given", () => {
        expect(targetSize(CROP, options({ mode: "dimensions", width: 300, height: 900 }))).toEqual({
            width: 300,
            height: 900,
        });
    });

    test("converts a physical size at the resolution given", () => {
        expect(
            targetSize(
                CROP,
                options({ mode: "dimensions", width: 45, height: 55, unit: "mm", dpi: 300 }),
            ),
        ).toEqual({ width: 531, height: 650 });
    });
});

describe("targetSize — percentage", () => {
    test("halves the crop", () => {
        expect(targetSize(CROP, options({ mode: "percentage", percentage: 50 }))).toEqual({
            width: 500,
            height: 250,
        });
    });

    test("100% is the crop itself", () => {
        expect(targetSize(CROP, options({ mode: "percentage", percentage: 100 }))).toEqual({
            width: 1000,
            height: 500,
        });
    });

    test("enlarges above 100%", () => {
        expect(targetSize(CROP, options({ mode: "percentage", percentage: 200 }))).toEqual({
            width: 2000,
            height: 1000,
        });
    });
});

describe("targetSize — preset", () => {
    test("measures a Bangladeshi passport photo at 300 DPI", () => {
        expect(
            targetSize(CROP, options({ mode: "preset", presetId: "bd-passport", dpi: 300 })),
        ).toEqual({ width: 531, height: 650 });
    });

    test("follows the resolution the reader is working at", () => {
        expect(
            targetSize(CROP, options({ mode: "preset", presetId: "bd-passport", dpi: 600 })),
        ).toEqual({ width: 1063, height: 1299 });
    });

    test("ignores the resolution for a preset published in pixels", () => {
        expect(
            targetSize(CROP, options({ mode: "preset", presetId: "facebook-cover", dpi: 600 })),
        ).toEqual({ width: 820, height: 312 });
    });

    test("falls back to the crop for an id nothing offers", () => {
        expect(targetSize(CROP, options({ mode: "preset", presetId: "no-such-preset" }))).toEqual({
            width: 1000,
            height: 500,
        });
    });
});

describe("planRender — fit", () => {
    const square = options({ mode: "dimensions", width: 400, height: 400, lockAspect: false });

    test("contain letterboxes rather than cutting", () => {
        const plan = planRender(CROP, { ...square, fit: "contain" });

        expect(plan.canvas).toEqual({ width: 400, height: 400 });
        expect(plan.draw).toEqual({ x: 0, y: 100, width: 400, height: 200 });
        expect(plan.clips).toBe(false);
    });

    test("cover fills and lets the overflow fall off the long edge", () => {
        const plan = planRender(CROP, { ...square, fit: "cover" });

        expect(plan.draw).toEqual({ x: -200, y: 0, width: 800, height: 400 });
        expect(plan.clips).toBe(true);
    });

    test("stretch fills the canvas corner to corner", () => {
        const plan = planRender(CROP, { ...square, fit: "stretch" });

        expect(plan.draw).toEqual({ x: 0, y: 0, width: 400, height: 400 });
        expect(plan.clips).toBe(false);
    });
});

describe("planRender — resampling", () => {
    test("a crop at its own size is never resampled", () => {
        const plan = planRender(CROP, options({ mode: "percentage", percentage: 100 }));

        expect(plan.resamples).toBe(false);
        expect(copiesPixels(plan)).toBe(true);
    });

    test("a crop into a box of a different shape is padded, not copied", () => {
        const plan = planRender(
            CROP,
            options({ mode: "dimensions", width: 1000, height: 800, lockAspect: false }),
        );

        expect(copiesPixels(plan)).toBe(false);
    });

    test("any scale at all is a resample", () => {
        expect(planRender(CROP, options({ mode: "percentage", percentage: 99 })).resamples).toBe(
            true,
        );
    });
});

describe("planRender — background", () => {
    test("a colour becomes a matte", () => {
        const plan = planRender(CROP, options({ background: "color", backgroundColor: "#123456" }));

        expect(plan.matte).toEqual({ r: 0x12, g: 0x34, b: 0x56 });
    });

    test("transparent keeps the alpha channel", () => {
        expect(planRender(CROP, options({ background: "transparent" })).matte).toBeNull();
    });
});

describe("planRender — zoom", () => {
    const square = options({ mode: "dimensions", width: 1000, height: 1000, fit: "contain" });

    test("100% leaves the fit mode exactly where it was", () => {
        const plan = planRender(CROP, { ...square, zoom: 100 });

        expect(plan.draw).toEqual({ x: 0, y: 250, width: 1000, height: 500 });
        expect(plan.clips).toBe(false);
    });

    test("multiplies whatever the fit mode chose rather than replacing it", () => {
        const plan = planRender(CROP, { ...square, zoom: 200 });

        expect(plan.draw.width).toBe(2000);
        expect(plan.draw.height).toBe(1000);
    });

    test("stays centred, so the box hangs off both sides equally", () => {
        const plan = planRender(CROP, { ...square, zoom: 200 });

        expect(plan.draw.x).toBe(-500);
        expect(plan.draw.width + 2 * plan.draw.x).toBe(plan.canvas.width);
    });

    test("zooming in clips and zooming out does not", () => {
        expect(planRender(CROP, { ...square, zoom: 200 }).clips).toBe(true);
        expect(planRender(CROP, { ...square, zoom: 60 }).clips).toBe(false);
    });

    test("never changes the size of the file, only what lands inside it", () => {
        for (const zoom of [50, 100, 175, 400]) {
            expect(planRender(CROP, { ...square, zoom }).canvas).toEqual({
                width: 1000,
                height: 1000,
            });
        }
    });

    test("a zoom is a resample, so the copy promise is withdrawn", () => {
        const exact = options({ mode: "dimensions", width: 1000, height: 500 });

        expect(copiesPixels(planRender(CROP, exact))).toBe(true);
        expect(copiesPixels(planRender(CROP, { ...exact, zoom: 101 }))).toBe(false);
    });

    test("scales a stretched draw box too, rather than ignoring the slider", () => {
        const plan = planRender(CROP, { ...square, fit: "stretch", zoom: 50 });

        expect(plan.draw).toEqual({ x: 250, y: 250, width: 500, height: 500 });
    });

    test("an unreadable zoom means no zoom, not the minimum", () => {
        const plan = planRender(CROP, { ...square, zoom: Number.NaN });

        expect(plan.draw).toEqual(planRender(CROP, { ...square, zoom: 100 }).draw);
    });
});

describe("isPlanTooLarge", () => {
    const wide = options({ mode: "dimensions", width: 6000, height: 6000 });

    test("passes a plan both of whose boxes fit", () => {
        expect(isPlanTooLarge(planRender(CROP, wide))).toBe(false);
    });

    /**
     * The check the canvas alone would miss. A 6000 × 6000 file is survivable;
     * the same file at 400% asks the resampler for 24000 × 12000 first, and
     * dies inside Lanczos rather than at the guard.
     */
    test("refuses a draw box the canvas cap cannot see", () => {
        const zoomed = planRender(CROP, { ...wide, zoom: 400 });

        expect(isOutputTooLarge(zoomed.canvas)).toBe(false);
        expect(isPlanTooLarge(zoomed)).toBe(true);
    });
});

describe("isOutputTooLarge", () => {
    test("allows a large but survivable canvas", () => {
        expect(isOutputTooLarge({ width: 6000, height: 6000 })).toBe(false);
    });

    test("refuses one nothing should allocate", () => {
        // A 1% crop scaled to 20000 × 20000 starts from almost nothing and
        // still asks for 1.6 GB, which the source cap does not catch.
        expect(isOutputTooLarge({ width: 20_000, height: 20_000 })).toBe(true);
        expect(isOutputTooLarge({ width: MAX_OUTPUT_PIXELS, height: 2 })).toBe(true);
    });
});
