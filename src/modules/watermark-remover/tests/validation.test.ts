import { describe, expect, test } from "bun:test";

import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";
import { watermarkRemovalRequestSchema } from "@/modules/watermark-remover/validation/removal";

function pngFile(name: string, bytes = 4): File {
    return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

const VALID = {
    token: "0.abc",
    image: pngFile("crop.png"),
    mask: pngFile("mask.png"),
};

describe("watermarkRemovalRequestSchema", () => {
    test("accepts a token with both files", () => {
        expect(watermarkRemovalRequestSchema.safeParse(VALID).success).toBe(true);
    });

    test("rejects a request with no mask", () => {
        expect(watermarkRemovalRequestSchema.safeParse({ ...VALID, mask: undefined }).success).toBe(
            false,
        );
    });

    test("rejects a request with no image", () => {
        expect(watermarkRemovalRequestSchema.safeParse({ ...VALID, image: null }).success).toBe(
            false,
        );
    });

    test("rejects a field that arrived as a plain string instead of a file", () => {
        // `formData.get` returns a string for a text field, which is exactly what
        // a hand-built request would send.
        expect(
            watermarkRemovalRequestSchema.safeParse({ ...VALID, image: "not-a-file" }).success,
        ).toBe(false);
    });

    test("rejects a blank token", () => {
        expect(watermarkRemovalRequestSchema.safeParse({ ...VALID, token: "" }).success).toBe(
            false,
        );
    });

    test("rejects a token past the length Cloudflare will ever issue", () => {
        const token = "a".repeat(MAX_TURNSTILE_TOKEN_LENGTH + 1);

        expect(watermarkRemovalRequestSchema.safeParse({ ...VALID, token }).success).toBe(false);
    });

    test("accepts a token sitting exactly on the ceiling", () => {
        const token = "a".repeat(MAX_TURNSTILE_TOKEN_LENGTH);

        expect(watermarkRemovalRequestSchema.safeParse({ ...VALID, token }).success).toBe(true);
    });

    test("leaves an empty file for the domain check rather than failing it here", () => {
        // Size is not this schema's business: `checkImageFile` turns it into a
        // reason the reader can act on.
        const parsed = watermarkRemovalRequestSchema.safeParse({
            ...VALID,
            image: new File([], "empty.png", { type: "image/png" }),
        });

        expect(parsed.success).toBe(true);
    });
});
