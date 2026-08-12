import { describe, expect, test } from "bun:test";

import {
    MAX_PERCENTAGE,
    MAX_QUALITY,
    MIN_PERCENTAGE,
    MIN_QUALITY,
} from "@/modules/image-resizer/domain/constants";
import { buildOutputFilename } from "@/modules/image-resizer/domain/filenames";
import {
    backgroundApplies,
    clampPercentage,
    clampQuality,
    isLosslessFormat,
    qualityApplies,
    resolveFormat,
    supportsAlpha,
} from "@/modules/image-resizer/domain/options";
describe("resolveFormat", () => {
    test("original keeps a format this site can write", () => {
        expect(resolveFormat("image/jpeg", "original")).toBe("jpeg");
        expect(resolveFormat("image/png", "original")).toBe("png");
        expect(resolveFormat("image/webp", "original")).toBe("webp");
        expect(resolveFormat("image/avif", "original")).toBe("avif");
    });

    test("original sends a format this site cannot write to PNG", () => {
        // GIF and BMP decode and do not encode, and PNG is the lossless landing
        // place — which the UI says, so nobody has to open the file to find out.
        expect(resolveFormat("image/gif", "original")).toBe("png");
        expect(resolveFormat("image/bmp", "original")).toBe("png");
    });

    test("normalises the source type it was handed", () => {
        expect(resolveFormat("IMAGE/JPEG; charset=binary", "original")).toBe("jpeg");
    });

    test("an explicit choice wins over the source", () => {
        expect(resolveFormat("image/png", "jpeg")).toBe("jpeg");
    });
});

describe("what applies to what", () => {
    test("quality is meaningless under a lossless encoder", () => {
        expect(qualityApplies("png")).toBe(false);
        expect(isLosslessFormat("png")).toBe(true);
        expect(qualityApplies("jpeg")).toBe(true);
        expect(qualityApplies("webp")).toBe(true);
        expect(qualityApplies("avif")).toBe(true);
    });

    test("JPEG is the one format with no alpha channel", () => {
        expect(supportsAlpha("jpeg")).toBe(false);
        expect(supportsAlpha("png")).toBe(true);
        expect(supportsAlpha("webp")).toBe(true);
        expect(supportsAlpha("avif")).toBe(true);
    });

    test("the background matters whenever padding or flattening can happen", () => {
        expect(backgroundApplies("contain", "png", false)).toBe(true);
        expect(backgroundApplies("cover", "png", true)).toBe(true);
        expect(backgroundApplies("cover", "jpeg", false)).toBe(true);
    });

    test("and goes dead only when none of the three can", () => {
        expect(backgroundApplies("cover", "png", false)).toBe(false);
        expect(backgroundApplies("stretch", "webp", false)).toBe(false);
    });
});

describe("clamps", () => {
    test("bound both ends and round", () => {
        expect(clampQuality(1)).toBe(MIN_QUALITY);
        expect(clampQuality(1_000)).toBe(MAX_QUALITY);
        expect(clampQuality(80.6)).toBe(81);
        expect(clampQuality(Number.NaN)).toBe(MIN_QUALITY);

        expect(clampPercentage(0)).toBe(MIN_PERCENTAGE);
        expect(clampPercentage(10_000)).toBe(MAX_PERCENTAGE);
        expect(clampPercentage(49.5)).toBe(50);
    });
});

describe("buildOutputFilename", () => {
    test("puts the size in the name", () => {
        expect(buildOutputFilename("holiday.jpg", "png", { width: 531, height: 650 })).toBe(
            "holiday-531x650.png",
        );
    });

    test("keeps a Unicode stem", () => {
        expect(buildOutputFilename("ছবি.png", "webp", { width: 100, height: 100 })).toBe(
            "ছবি-100x100.webp",
        );
    });

    test("falls back rather than producing a nameless file", () => {
        expect(buildOutputFilename(".jpg", "jpeg", { width: 10, height: 10 })).toBe(
            "image-10x10.jpg",
        );
    });
});
