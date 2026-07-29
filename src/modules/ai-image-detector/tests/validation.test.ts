import { describe, expect, test } from "bun:test";

import {
    imageDetectionRequestSchema,
    imageDetectorResponseSchema,
} from "@/modules/ai-image-detector/validation/detection";
import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";

function buildImage(): File {
    return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "shot.png", { type: "image/png" });
}

describe("imageDetectionRequestSchema", () => {
    test("accepts a file and token pair", () => {
        const parsed = imageDetectionRequestSchema.safeParse({
            token: "0.abc",
            image: buildImage(),
        });

        expect(parsed.success).toBe(true);
    });

    test("rejects a missing token", () => {
        expect(
            imageDetectionRequestSchema.safeParse({ token: "", image: buildImage() }).success,
        ).toBe(false);
    });

    test("rejects an unbounded token", () => {
        const token = "0".repeat(MAX_TURNSTILE_TOKEN_LENGTH + 1);

        expect(imageDetectionRequestSchema.safeParse({ token, image: buildImage() }).success).toBe(
            false,
        );
    });

    test("rejects a field that is a string rather than a file", () => {
        expect(
            imageDetectionRequestSchema.safeParse({ token: "0.abc", image: "shot.png" }).success,
        ).toBe(false);
    });

    test("rejects an absent file, which is what an empty form field parses to", () => {
        expect(imageDetectionRequestSchema.safeParse({ token: "0.abc", image: null }).success).toBe(
            false,
        );
    });

    test("leaves the type and size rules to the domain", () => {
        // A 20 MB SVG still parses here; `checkImageFile` is what turns it into
        // a reason the reader can act on.
        const oversized = new File(["<svg />"], "diagram.svg", { type: "image/svg+xml" });

        expect(
            imageDetectionRequestSchema.safeParse({ token: "0.abc", image: oversized }).success,
        ).toBe(true);
    });
});

describe("imageDetectorResponseSchema", () => {
    test("reads the worker's success envelope", () => {
        const parsed = imageDetectorResponseSchema.safeParse({
            success: true,
            result: {
                is_ai_generated: true,
                confidence: "high",
                reasoning: "Impossible shadows.",
            },
        });

        expect(parsed.success).toBe(true);
    });

    test("reads the worker's failure envelope", () => {
        const parsed = imageDetectorResponseSchema.safeParse({
            success: false,
            error: "Failed to analyze image. Please try again.",
        });

        expect(parsed.success).toBe(true);
    });

    test("accepts a result whose fields the model filled in badly", () => {
        // The domain decides what a half-filled answer means; rejecting it here
        // would collapse every shape of nonsense into one message.
        const parsed = imageDetectorResponseSchema.safeParse({
            success: true,
            result: { is_ai_generated: "maybe", confidence: 0.9, reasoning: null },
        });

        expect(parsed.success).toBe(true);
    });

    test("rejects a reply that is not an object", () => {
        expect(imageDetectorResponseSchema.safeParse("ai-generated").success).toBe(false);
    });
});
