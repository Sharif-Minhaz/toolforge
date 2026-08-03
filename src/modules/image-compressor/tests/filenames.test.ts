import { describe, expect, test } from "bun:test";

import {
    buildArchiveFilename,
    buildOutputFilename,
} from "@/modules/image-compressor/domain/filenames";
import {
    RASTER_FORMAT_EXTENSIONS,
    RASTER_FORMAT_MIME_TYPES,
} from "@/modules/tools/domain/image-codec";
import { RASTER_FORMATS } from "@/modules/tools/types";

describe("buildOutputFilename", () => {
    test("names the file after the reader's own, plus what happened to it", () => {
        expect(buildOutputFilename("holiday.png", "webp")).toBe("holiday-min.webp");
    });

    test("uses jpg rather than jpeg, which is what a camera roll expects", () => {
        expect(buildOutputFilename("photo.png", "jpeg")).toBe("photo-min.jpg");
    });

    test("every format has an extension and a MIME type", () => {
        for (const format of RASTER_FORMATS) {
            expect(RASTER_FORMAT_EXTENSIONS[format].length).toBeGreaterThan(0);
            expect(RASTER_FORMAT_MIME_TYPES[format]).toStartWith("image/");
            expect(buildOutputFilename("x.bin", format)).toBe(
                `x-min.${RASTER_FORMAT_EXTENSIONS[format]}`,
            );
        }
    });
});

describe("buildArchiveFilename", () => {
    test("stamps the instant so downloads sort chronologically", () => {
        expect(buildArchiveFilename(new Date("2026-08-03T10:15:00.000Z"))).toBe(
            "toolforge-images-20260803T101500Z.zip",
        );
    });

    test("drops the milliseconds but keeps the zone marker", () => {
        expect(buildArchiveFilename(new Date("2026-01-02T03:04:05.678Z"))).toBe(
            "toolforge-images-20260102T030405Z.zip",
        );
    });
});
