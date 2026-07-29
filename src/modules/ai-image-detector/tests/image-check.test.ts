import { describe, expect, test } from "bun:test";

import {
    ALLOWED_IMAGE_TYPES,
    IMAGE_ACCEPT_ATTRIBUTE,
    MAX_IMAGE_BYTES,
} from "@/modules/ai-image-detector/domain/constants";
import {
    checkImageFile,
    isAllowedImageType,
    normalizeImageType,
} from "@/modules/ai-image-detector/domain/image-check";

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
    for (const type of ALLOWED_IMAGE_TYPES) {
        test(`accepts ${type}`, () => {
            expect(isAllowedImageType(type)).toBe(true);
        });
    }

    test("accepts a type the browser reported with parameters or odd casing", () => {
        expect(isAllowedImageType("IMAGE/WEBP")).toBe(true);
        expect(isAllowedImageType("image/gif; something=else")).toBe(true);
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
            expect(isAllowedImageType(type)).toBe(false);
        });
    }
});

describe("checkImageFile", () => {
    test("passes a normal picture and reports its normalised type", () => {
        const result = checkImageFile({ type: "IMAGE/PNG", size: 128_000 });

        expect(result).toEqual({ ok: true, type: "image/png" });
    });

    test("accepts a file sitting exactly on the ceiling", () => {
        expect(checkImageFile({ type: "image/jpeg", size: MAX_IMAGE_BYTES }).ok).toBe(true);
    });

    test("rejects a file one byte over the ceiling", () => {
        expect(checkImageFile({ type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 })).toEqual({
            ok: false,
            reason: "too_large",
        });
    });

    test("rejects an unsupported type before it costs a round trip", () => {
        expect(checkImageFile({ type: "image/svg+xml", size: 4_000 })).toEqual({
            ok: false,
            reason: "unsupported_type",
        });
    });

    test("calls a zero-byte pick empty rather than untyped", () => {
        // A browser hands back `type: ""` for an empty pick, so the type rule
        // would fire first and blame the wrong thing.
        expect(checkImageFile({ type: "", size: 0 })).toEqual({ ok: false, reason: "empty_file" });
        expect(checkImageFile({ type: "image/png", size: 0 })).toEqual({
            ok: false,
            reason: "empty_file",
        });
    });

    test("treats a negative size as empty rather than passing it upstream", () => {
        expect(checkImageFile({ type: "image/png", size: -1 })).toEqual({
            ok: false,
            reason: "empty_file",
        });
    });
});

describe("IMAGE_ACCEPT_ATTRIBUTE", () => {
    test("lists exactly the allowed types, so the picker and the check agree", () => {
        expect(IMAGE_ACCEPT_ATTRIBUTE.split(",")).toEqual([...ALLOWED_IMAGE_TYPES]);
    });
});
