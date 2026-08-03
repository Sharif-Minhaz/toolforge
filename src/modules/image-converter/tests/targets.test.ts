import { describe, expect, test } from "bun:test";

import { DEFAULT_ICON_SIZES, DEFAULT_OPTIONS } from "@/modules/image-converter/domain/constants";
import { FAVICON_ICO_SIZES } from "@/modules/image-converter/domain/favicon";
import {
    backgroundValues,
    clampQuality,
    iconSizesApply,
    isRetryableFailure,
    isSingleFileTarget,
    needsWork,
    optionsSignature,
    qualityApplies,
    resizeApplies,
    resolveBackground,
    resolveIconSizes,
    targetFormat,
} from "@/modules/image-converter/domain/targets";
import {
    CONVERSION_TARGETS,
    type ConversionFailureReason,
    type ConversionOptions,
    type ConversionTarget,
} from "@/modules/image-converter/types";
import { BLACK_MATTE, WHITE_MATTE } from "@/modules/tools/domain/pixels";

function options(patch: Partial<ConversionOptions> = {}): ConversionOptions {
    return { ...DEFAULT_OPTIONS, ...patch };
}

describe("targetFormat", () => {
    test("the four raster targets name their own encoder", () => {
        expect(targetFormat("png")).toBe("png");
        expect(targetFormat("jpeg")).toBe("jpeg");
        expect(targetFormat("webp")).toBe("webp");
        expect(targetFormat("avif")).toBe("avif");
    });

    test("the two icon targets are containers, not formats", () => {
        expect(targetFormat("ico")).toBeNull();
        expect(targetFormat("favicon")).toBeNull();
    });

    test("every target is answered", () => {
        for (const target of CONVERSION_TARGETS) {
            expect(targetFormat(target) === null || typeof targetFormat(target) === "string").toBe(
                true,
            );
        }
    });
});

describe("which controls apply", () => {
    test("quality reaches only the lossy encoders", () => {
        for (const target of CONVERSION_TARGETS) {
            expect(qualityApplies(target)).toBe(
                target === "jpeg" || target === "webp" || target === "avif",
            );
        }
    });

    test("the size cap reaches only the raster targets", () => {
        for (const target of CONVERSION_TARGETS) {
            expect(resizeApplies(target)).toBe(targetFormat(target) !== null);
        }
    });

    test("only a plain ico lets the reader choose its sizes", () => {
        for (const target of CONVERSION_TARGETS) {
            expect(iconSizesApply(target)).toBe(target === "ico");
        }
    });

    test("only the pack writes more than one file", () => {
        for (const target of CONVERSION_TARGETS) {
            expect(isSingleFileTarget(target)).toBe(target !== "favicon");
        }
    });
});

describe("backgroundValues", () => {
    test("JPEG cannot offer transparency, because it has no alpha channel", () => {
        expect(backgroundValues("jpeg")).toEqual(["white", "black"]);
    });

    test("every other target keeps all three", () => {
        for (const target of CONVERSION_TARGETS) {
            if (target !== "jpeg") {
                expect(backgroundValues(target)).toEqual(["transparent", "white", "black"]);
            }
        }
    });

    test("the list is never empty, whatever the target", () => {
        for (const target of CONVERSION_TARGETS) {
            expect(backgroundValues(target).length).toBeGreaterThan(0);
        }
    });
});

describe("resolveBackground", () => {
    test("names the matte for the two colours", () => {
        expect(resolveBackground("png", "white")).toEqual(WHITE_MATTE);
        expect(resolveBackground("png", "black")).toEqual(BLACK_MATTE);
    });

    test("transparent keeps the alpha channel on every format that has one", () => {
        for (const target of CONVERSION_TARGETS) {
            if (target !== "jpeg") {
                expect(resolveBackground(target, "transparent")).toBeNull();
            }
        }
    });

    test("a hand-edited link asking JPEG for transparency lands on white", () => {
        // Not black: an encoder handed transparent pixels leaves black behind,
        // and black is the outcome people report as a bug.
        expect(resolveBackground("jpeg", "transparent")).toEqual(WHITE_MATTE);
    });
});

describe("resolveIconSizes", () => {
    test("a raster target writes no squares", () => {
        expect(resolveIconSizes(options({ target: "webp" }))).toEqual([]);
    });

    test("the pack's sizes are fixed, whatever the size control says", () => {
        expect(resolveIconSizes(options({ target: "favicon", iconSizes: [256] }))).toEqual(
            FAVICON_ICO_SIZES,
        );
    });

    test("an ico takes the chosen sizes, sorted and deduplicated", () => {
        expect(resolveIconSizes(options({ target: "ico", iconSizes: [128, 16, 128, 32] }))).toEqual(
            [16, 32, 128],
        );
    });

    test("an empty list from a hand-edited link falls back to the defaults", () => {
        expect(resolveIconSizes(options({ target: "ico", iconSizes: [] }))).toEqual(
            DEFAULT_ICON_SIZES,
        );
    });
});

describe("optionsSignature", () => {
    test("the same options produce the same key", () => {
        expect(optionsSignature(options())).toBe(optionsSignature(options()));
    });

    test("changing the target changes the key", () => {
        expect(optionsSignature(options({ target: "png" }))).not.toBe(
            optionsSignature(options({ target: "webp" })),
        );
    });

    test("quality moves the key only where quality is spent", () => {
        for (const target of CONVERSION_TARGETS) {
            const changed =
                optionsSignature(options({ target, quality: 40 })) !==
                optionsSignature(options({ target, quality: 90 }));

            expect(changed).toBe(qualityApplies(target));
        }
    });

    test("the size cap moves the key only where the cap is read", () => {
        for (const target of CONVERSION_TARGETS) {
            const changed =
                optionsSignature(options({ target, maxEdge: null })) !==
                optionsSignature(options({ target, maxEdge: 800 }));

            expect(changed).toBe(resizeApplies(target));
        }
    });

    test("the icon sizes move the key only for a plain ico", () => {
        for (const target of CONVERSION_TARGETS) {
            const changed =
                optionsSignature(options({ target, iconSizes: [16] })) !==
                optionsSignature(options({ target, iconSizes: [16, 32, 48] }));

            expect(changed).toBe(iconSizesApply(target));
        }
    });

    test("the background always moves the key", () => {
        for (const target of CONVERSION_TARGETS) {
            const values = backgroundValues(target);

            expect(optionsSignature(options({ target, background: values[0] }))).not.toBe(
                optionsSignature(options({ target, background: values[1] })),
            );
        }
    });

    test("two size lists that resolve the same way share a key", () => {
        expect(optionsSignature(options({ target: "ico", iconSizes: [32, 16] }))).toBe(
            optionsSignature(options({ target: "ico", iconSizes: [16, 32] })),
        );
    });
});

describe("clampQuality", () => {
    test("holds a value inside the range untouched", () => {
        expect(clampQuality(55, 10, 100)).toBe(55);
    });

    test("pulls both ends in", () => {
        expect(clampQuality(-20, 10, 100)).toBe(10);
        expect(clampQuality(400, 10, 100)).toBe(100);
    });

    test("rounds a fractional value", () => {
        expect(clampQuality(80.6, 10, 100)).toBe(81);
    });

    test("falls to the floor on a value that is not a number", () => {
        expect(clampQuality(Number.NaN, 10, 100)).toBe(10);
        expect(clampQuality(Number.POSITIVE_INFINITY, 10, 100)).toBe(10);
    });
});

describe("isRetryableFailure", () => {
    test("only the encoder's own refusal is worth another attempt", () => {
        const reasons: readonly ConversionFailureReason[] = [
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

describe("the default options are internally consistent", () => {
    test("the default target is one the control offers", () => {
        expect(CONVERSION_TARGETS).toContain(DEFAULT_OPTIONS.target satisfies ConversionTarget);
    });

    test("the default background is legal for the default target", () => {
        expect(backgroundValues(DEFAULT_OPTIONS.target)).toContain(DEFAULT_OPTIONS.background);
    });

    test("the default icon sizes are never empty", () => {
        expect(DEFAULT_OPTIONS.iconSizes.length).toBeGreaterThan(0);
    });
});

describe("needsWork", () => {
    const settings = optionsSignature(DEFAULT_OPTIONS);
    const other = optionsSignature({ ...DEFAULT_OPTIONS, target: "png" });

    test("a picked file that has never run is pending", () => {
        expect(needsWork({ hasResult: false, reason: null, signature: null }, settings)).toBe(true);
    });

    test("a finished row is left alone, whatever the panel says now", () => {
        const done = { hasResult: true, reason: null, signature: settings } as const;

        expect(needsWork(done, settings)).toBe(false);
        expect(needsWork({ ...done, signature: other }, settings)).toBe(false);
    });

    test("adding a file after a run picks up only the new one", () => {
        const queue = [
            { hasResult: true, reason: null, signature: other },
            { hasResult: false, reason: null, signature: null },
        ] as const;

        expect(queue.filter((row) => needsWork(row, settings))).toHaveLength(1);
    });

    test("an encode failure is retried once the settings move, not before", () => {
        const failed = { hasResult: false, reason: "encode_failed", signature: settings } as const;

        expect(needsWork(failed, settings)).toBe(false);
        expect(needsWork(failed, other)).toBe(true);
    });

    test("a rejection the settings cannot fix is never retried", () => {
        const failed = { hasResult: false, reason: "too_large", signature: settings } as const;

        expect(needsWork(failed, settings)).toBe(false);
        expect(needsWork(failed, other)).toBe(false);
    });
});
