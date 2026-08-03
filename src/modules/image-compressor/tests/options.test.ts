import { describe, expect, test } from "bun:test";

import {
    DEFAULT_QUALITY,
    MAX_QUALITY,
    MIN_QUALITY,
    RESIZE_EDGES,
} from "@/modules/image-compressor/domain/constants";
import {
    candidateFormats,
    clampQuality,
    formatForSourceType,
    isLosslessFormat,
    isRetryableFailure,
    needsWork,
    optionsSignature,
    qualityApplies,
} from "@/modules/image-compressor/domain/options";
import type { CompressionFailureReason } from "@/modules/image-compressor/types";
import { fitWithinEdge } from "@/modules/tools/domain/pixels";
import { RASTER_FORMATS, type RasterFormat } from "@/modules/tools/types";

describe("clampQuality", () => {
    test("holds values inside the range untouched", () => {
        expect(clampQuality(DEFAULT_QUALITY)).toBe(DEFAULT_QUALITY);
        expect(clampQuality(MIN_QUALITY)).toBe(MIN_QUALITY);
        expect(clampQuality(MAX_QUALITY)).toBe(MAX_QUALITY);
    });

    test("clamps either side of the range", () => {
        expect(clampQuality(MIN_QUALITY - 1)).toBe(MIN_QUALITY);
        expect(clampQuality(MAX_QUALITY + 1)).toBe(MAX_QUALITY);
        expect(clampQuality(-500)).toBe(MIN_QUALITY);
        expect(clampQuality(5000)).toBe(MAX_QUALITY);
    });

    test("rounds a fractional slider position", () => {
        expect(clampQuality(74.4)).toBe(74);
        expect(clampQuality(74.5)).toBe(75);
    });

    test("degrades a non-number to the floor rather than propagating NaN", () => {
        expect(clampQuality(Number.NaN)).toBe(MIN_QUALITY);
        expect(clampQuality(Number.POSITIVE_INFINITY)).toBe(MIN_QUALITY);
    });
});

describe("formatForSourceType", () => {
    const cases: readonly (readonly [string, RasterFormat])[] = [
        ["image/jpeg", "jpeg"],
        ["image/webp", "webp"],
        ["image/avif", "avif"],
        ["image/png", "png"],
        ["image/gif", "png"],
        ["image/bmp", "png"],
        ["application/octet-stream", "png"],
        ["", "png"],
    ];

    for (const [sourceType, expected] of cases) {
        test(`maps ${sourceType || "an empty type"} to ${expected}`, () => {
            expect(formatForSourceType(sourceType)).toBe(expected);
        });
    }
});

describe("candidateFormats", () => {
    test("auto returns exactly the source's own format", () => {
        expect(candidateFormats("auto", "image/jpeg", true)).toEqual(["jpeg"]);
        expect(candidateFormats("auto", "image/png", false)).toEqual(["png"]);
    });

    test("an explicit format ignores the source entirely", () => {
        for (const format of RASTER_FORMATS) {
            expect(candidateFormats(format, "image/gif", false)).toEqual([format]);
        }
    });

    test("smallest offers JPEG only when nothing is transparent", () => {
        expect(candidateFormats("smallest", "image/jpeg", true)).toContain("jpeg");
        expect(candidateFormats("smallest", "image/png", false)).not.toContain("jpeg");
    });

    test("smallest offers PNG only against a lossless source", () => {
        expect(candidateFormats("smallest", "image/png", true)).toContain("png");
        expect(candidateFormats("smallest", "image/gif", true)).toContain("png");
        expect(candidateFormats("smallest", "image/jpeg", true)).not.toContain("png");
    });

    test("smallest always tries both modern codecs", () => {
        for (const sourceType of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
            const candidates = candidateFormats("smallest", sourceType, true);

            expect(candidates).toContain("webp");
            expect(candidates).toContain("avif");
        }
    });

    test("never returns an empty shortlist", () => {
        for (const sourceType of ["image/jpeg", "image/png", "image/webp", "image/bmp", ""]) {
            for (const opaque of [true, false]) {
                expect(candidateFormats("smallest", sourceType, opaque).length).toBeGreaterThan(0);
                expect(candidateFormats("auto", sourceType, opaque).length).toBe(1);
            }
        }
    });
});

describe("quality applicability", () => {
    test("only PNG is lossless", () => {
        for (const format of RASTER_FORMATS) {
            expect(isLosslessFormat(format)).toBe(format === "png");
        }
    });

    test("the slider is dead only when PNG is forced", () => {
        expect(qualityApplies("png")).toBe(false);
        expect(qualityApplies("auto")).toBe(true);
        expect(qualityApplies("smallest")).toBe(true);
        expect(qualityApplies("jpeg")).toBe(true);
        expect(qualityApplies("webp")).toBe(true);
        expect(qualityApplies("avif")).toBe(true);
    });
});

describe("optionsSignature", () => {
    const base = { quality: 75, format: "auto", maxEdge: null } as const;

    test("the same settings produce the same key", () => {
        expect(optionsSignature(base)).toBe(optionsSignature({ ...base }));
    });

    test("every field moves the key", () => {
        expect(optionsSignature({ ...base, quality: 76 })).not.toBe(optionsSignature(base));
        expect(optionsSignature({ ...base, format: "webp" })).not.toBe(optionsSignature(base));
        expect(optionsSignature({ ...base, maxEdge: 1920 })).not.toBe(optionsSignature(base));
    });

    test("no cap is distinguishable from a numeric cap", () => {
        expect(optionsSignature({ ...base, maxEdge: null })).not.toBe(
            optionsSignature({ ...base, maxEdge: 800 }),
        );
    });
});

describe("isRetryableFailure", () => {
    test("only the encoder's refusal is worth another attempt", () => {
        const reasons: readonly CompressionFailureReason[] = [
            "empty_file",
            "unsupported_type",
            "too_large",
            "too_many_files",
            "too_many_pixels",
            "undecodable",
            "encode_failed",
        ];

        for (const reason of reasons) {
            expect(isRetryableFailure(reason)).toBe(reason === "encode_failed");
        }
    });
});

describe("fitWithinEdge — this tool's presets", () => {
    test("every preset shrinks a 4K photograph to its own longest edge", () => {
        for (const edge of RESIZE_EDGES) {
            const result = fitWithinEdge({ width: 4000, height: 3000 }, edge);

            expect(Math.max(result.width, result.height)).toBe(edge ?? 4000);
        }
    });
});

describe("needsWork", () => {
    const settings = "webp:75:original";

    test("a picked file that has never run is pending", () => {
        expect(needsWork({ hasResult: false, reason: null, signature: null }, settings)).toBe(true);
    });

    test("a finished row is left alone, whatever the panel says now", () => {
        const done = { hasResult: true, reason: null, signature: settings } as const;

        expect(needsWork(done, settings)).toBe(false);
        expect(needsWork({ ...done, signature: "avif:40:800" }, settings)).toBe(false);
    });

    test("adding a file after a run picks up only the new one", () => {
        const queue = [
            { hasResult: true, reason: null, signature: "png:75:original" },
            { hasResult: false, reason: null, signature: null },
        ] as const;

        expect(queue.filter((row) => needsWork(row, settings))).toHaveLength(1);
    });

    test("an encode failure is retried once the settings move, not before", () => {
        const failed = { hasResult: false, reason: "encode_failed", signature: settings } as const;

        expect(needsWork(failed, settings)).toBe(false);
        expect(needsWork(failed, "avif:75:original")).toBe(true);
    });

    test("a rejection the settings cannot fix is never retried", () => {
        const failed = { hasResult: false, reason: "too_large", signature: settings } as const;

        expect(needsWork(failed, settings)).toBe(false);
        expect(needsWork(failed, "avif:75:original")).toBe(false);
    });
});
