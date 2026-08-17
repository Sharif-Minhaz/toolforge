import { describe, expect, test } from "bun:test";

import { DEFAULT_OPTIONS } from "@/modules/image-resizer/domain/constants";
import {
    resizeOptionsSchema,
    resizeSearchParamsSchema,
} from "@/modules/image-resizer/validation/resize-options";

describe("resizeOptionsSchema", () => {
    test("accepts the defaults the panel opens on", () => {
        expect(resizeOptionsSchema.safeParse(DEFAULT_OPTIONS).success).toBe(true);
    });

    test("accepts a blank side, which is how one dimension is derived", () => {
        expect(
            resizeOptionsSchema.safeParse({ ...DEFAULT_OPTIONS, width: 800, height: null }).success,
        ).toBe(true);
    });

    test("refuses a colour that is not one", () => {
        expect(
            resizeOptionsSchema.safeParse({ ...DEFAULT_OPTIONS, backgroundColor: "white" }).success,
        ).toBe(false);
    });

    test("refuses a preset nothing offers", () => {
        expect(
            resizeOptionsSchema.safeParse({ ...DEFAULT_OPTIONS, presetId: "mars-visa" }).success,
        ).toBe(false);
    });
});

describe("resizeSearchParamsSchema", () => {
    test("reads a shareable link", () => {
        expect(
            resizeSearchParamsSchema.parse({
                mode: "preset",
                preset: "bd-passport",
                dpi: "600",
                format: "jpeg",
                quality: "90",
            }),
        ).toEqual({
            mode: "preset",
            preset: "bd-passport",
            dpi: 600,
            format: "jpeg",
            quality: 90,
            w: undefined,
            h: undefined,
            unit: undefined,
            percent: undefined,
            fit: undefined,
            bg: undefined,
        });
    });

    test("each field degrades on its own rather than throwing the page away", () => {
        const parsed = resizeSearchParamsSchema.parse({
            mode: "percentage",
            percent: "not a number",
            preset: "mars-visa",
            quality: "9999",
            fit: "cover",
        });

        expect(parsed.mode).toBe("percentage");
        expect(parsed.fit).toBe("cover");
        expect(parsed.percent).toBeUndefined();
        expect(parsed.preset).toBeUndefined();
        expect(parsed.quality).toBeUndefined();
    });

    test("reads a zoom, and drops one outside the slider's own range", () => {
        expect(resizeSearchParamsSchema.parse({ zoom: "160" }).zoom).toBe(160);
        // Left undefined rather than clamped: the page then opens on 100, which
        // is the only zoom that is not a visible edit nobody asked for.
        expect(resizeSearchParamsSchema.parse({ zoom: "5000" }).zoom).toBeUndefined();
        expect(resizeSearchParamsSchema.parse({ zoom: "wide" }).zoom).toBeUndefined();
    });

    test("survives a completely empty query", () => {
        expect(resizeSearchParamsSchema.parse({}).mode).toBeUndefined();
    });
});
