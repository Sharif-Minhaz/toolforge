import { describe, expect, test } from "bun:test";

import {
    checkImageFile,
    isAllowedImageType,
    normalizeImageType,
    type ImageFileLimits,
} from "@/modules/tools/domain/image-file";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"] as const;

type AllowedType = (typeof ALLOWED)[number];

const LIMITS: ImageFileLimits<AllowedType> = { allowedTypes: ALLOWED, maxBytes: 1_048_576 };

describe("normalizeImageType", () => {
    const cases: readonly (readonly [string, string])[] = [
        ["image/png", "image/png"],
        ["IMAGE/PNG", "image/png"],
        ["  image/jpeg  ", "image/jpeg"],
        ["image/jpeg; charset=binary", "image/jpeg"],
        ["", ""],
    ];

    for (const [raw, expected] of cases) {
        test(`maps ${JSON.stringify(raw)} to ${JSON.stringify(expected)}`, () => {
            expect(normalizeImageType(raw)).toBe(expected);
        });
    }
});

describe("isAllowedImageType", () => {
    for (const type of ALLOWED) {
        test(`accepts ${type}`, () => {
            expect(isAllowedImageType(type, ALLOWED)).toBe(true);
        });
    }

    test("accepts a type the browser reported with parameters or odd casing", () => {
        expect(isAllowedImageType("IMAGE/WEBP", ALLOWED)).toBe(true);
        expect(isAllowedImageType("image/gif; something=else", ALLOWED)).toBe(true);
    });

    const rejected = [
        "image/svg+xml",
        "image/avif",
        "image/heic",
        "application/pdf",
        "text/plain",
        "",
    ];

    for (const type of rejected) {
        test(`rejects ${JSON.stringify(type)}`, () => {
            expect(isAllowedImageType(type, ALLOWED)).toBe(false);
        });
    }

    test("answers per allow-list, not per module constant", () => {
        expect(isAllowedImageType("image/gif", ["image/png"])).toBe(false);
        expect(isAllowedImageType("image/gif", ALLOWED)).toBe(true);
    });
});

describe("checkImageFile", () => {
    test("passes a normal picture and reports its normalised type", () => {
        const result = checkImageFile({ type: "IMAGE/PNG", size: 128_000 }, LIMITS);

        expect(result).toEqual({ ok: true, type: "image/png" });
    });

    test("accepts a file sitting exactly on the ceiling", () => {
        expect(checkImageFile({ type: "image/jpeg", size: LIMITS.maxBytes }, LIMITS).ok).toBe(true);
    });

    test("rejects a file one byte over the ceiling", () => {
        expect(checkImageFile({ type: "image/jpeg", size: LIMITS.maxBytes + 1 }, LIMITS)).toEqual({
            ok: false,
            reason: "too_large",
        });
    });

    test("rejects an unsupported type before it costs a round trip", () => {
        expect(checkImageFile({ type: "image/svg+xml", size: 4_000 }, LIMITS)).toEqual({
            ok: false,
            reason: "unsupported_type",
        });
    });

    test("calls a zero-byte pick empty rather than untyped", () => {
        // A browser hands back `type: ""` for an empty pick, so the type rule
        // would fire first and blame the wrong thing.
        expect(checkImageFile({ type: "", size: 0 }, LIMITS)).toEqual({
            ok: false,
            reason: "empty_file",
        });
        expect(checkImageFile({ type: "image/png", size: 0 }, LIMITS)).toEqual({
            ok: false,
            reason: "empty_file",
        });
    });

    test("treats a negative size as empty rather than passing it upstream", () => {
        expect(checkImageFile({ type: "image/png", size: -1 }, LIMITS)).toEqual({
            ok: false,
            reason: "empty_file",
        });
    });

    test("reports the type rejection before the size one", () => {
        // An oversized file of an impossible type is turned away for the reason
        // that no amount of resizing would fix.
        expect(checkImageFile({ type: "image/heic", size: LIMITS.maxBytes * 4 }, LIMITS)).toEqual({
            ok: false,
            reason: "unsupported_type",
        });
    });
});
