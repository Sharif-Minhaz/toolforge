import { describe, expect, test } from "bun:test";

import {
    buildArchiveFilename,
    buildConvertedFilename,
    buildPackFilename,
} from "@/modules/image-converter/domain/filenames";
import { targetFormat } from "@/modules/image-converter/domain/targets";
import { CONVERSION_TARGETS } from "@/modules/image-converter/types";

describe("buildConvertedFilename", () => {
    test("keeps the reader's own name and only swaps the extension", () => {
        expect(buildConvertedFilename("holiday.png", "webp")).toBe("holiday.webp");
        expect(buildConvertedFilename("holiday.png", "avif")).toBe("holiday.avif");
    });

    test("uses jpg rather than jpeg, which is what a camera roll expects", () => {
        expect(buildConvertedFilename("photo.png", "jpeg")).toBe("photo.jpg");
    });

    test("both icon targets carry the ico extension", () => {
        expect(buildConvertedFilename("logo.png", "ico")).toBe("logo.ico");
        expect(buildConvertedFilename("logo.png", "favicon")).toBe("logo.ico");
    });

    test("every target produces a name with an extension on it", () => {
        for (const target of CONVERSION_TARGETS) {
            const name = buildConvertedFilename("x.bin", target);

            expect(name).toStartWith("x.");
            expect(name.split(".")[1].length).toBeGreaterThan(0);
        }
    });

    test("re-encoding a format into itself round-trips to the same name", () => {
        // Correct, not a collision: it is the same picture at a new quality.
        expect(buildConvertedFilename("holiday.webp", "webp")).toBe("holiday.webp");
    });

    test("cleans a dangerous source name", () => {
        expect(buildConvertedFilename("../../etc/passwd.png", "png")).toBe("etc-passwd.png");
    });

    test("keeps a Bangla name rather than slugging it away", () => {
        expect(buildConvertedFilename("ছবি.png", "webp")).toBe("ছবি.webp");
    });

    test("the raster targets and the extension map agree", () => {
        for (const target of CONVERSION_TARGETS) {
            if (targetFormat(target) === null) {
                expect(buildConvertedFilename("x.png", target)).toEndWith(".ico");
            }
        }
    });
});

describe("buildPackFilename", () => {
    test("names a pack after the picture it came from", () => {
        expect(buildPackFilename("holiday.png")).toBe("holiday-favicon.zip");
    });

    test("cleans the source name first", () => {
        expect(buildPackFilename("my logo.svg.png")).toBe("my-logo.svg-favicon.zip");
    });

    test("falls back when nothing usable is left", () => {
        expect(buildPackFilename(".png")).toBe("image-favicon.zip");
    });
});

describe("buildArchiveFilename", () => {
    test("stamps the instant so downloads sort chronologically", () => {
        expect(buildArchiveFilename(new Date("2026-08-03T10:15:00.000Z"))).toBe(
            "toolforge-converted-20260803T101500Z.zip",
        );
    });

    test("does not collide with the compressor's archive name", () => {
        expect(buildArchiveFilename(new Date("2026-08-03T10:15:00.000Z"))).not.toContain(
            "toolforge-images",
        );
    });
});
