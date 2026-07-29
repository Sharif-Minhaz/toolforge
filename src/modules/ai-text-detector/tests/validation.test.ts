import { describe, expect, test } from "bun:test";

import {
    MAX_DETECTION_TEXT_LENGTH,
    MAX_SUBMITTED_TEXT_LENGTH,
} from "@/modules/ai-text-detector/domain/constants";
import {
    aiTextDetectorSearchParamsSchema,
    detectionRequestSchema,
    detectorResponseSchema,
} from "@/modules/ai-text-detector/validation/detection";
import { MAX_TURNSTILE_TOKEN_LENGTH } from "@/modules/tools/domain/turnstile";

describe("detectionRequestSchema", () => {
    test("accepts a text and token pair", () => {
        const parsed = detectionRequestSchema.safeParse({ text: "a passage", token: "0.abc" });

        expect(parsed.success).toBe(true);
    });

    test("rejects a missing or empty token, so nothing reaches the model unchallenged", () => {
        expect(detectionRequestSchema.safeParse({ text: "a passage" }).success).toBe(false);
        expect(detectionRequestSchema.safeParse({ text: "a passage", token: "" }).success).toBe(
            false,
        );
    });

    test("rejects an absurd token", () => {
        const token = "0".repeat(MAX_TURNSTILE_TOKEN_LENGTH + 1);

        expect(detectionRequestSchema.safeParse({ text: "a passage", token }).success).toBe(false);
    });

    test("still parses text past the detector ceiling, so it can be reported as too long", () => {
        const text = "a".repeat(MAX_DETECTION_TEXT_LENGTH + 1);

        expect(detectionRequestSchema.safeParse({ text, token: "0.abc" }).success).toBe(true);
    });

    test("refuses an unbounded body", () => {
        const text = "a".repeat(MAX_SUBMITTED_TEXT_LENGTH + 1);

        expect(detectionRequestSchema.safeParse({ text, token: "0.abc" }).success).toBe(false);
    });

    test("rejects a non-object payload", () => {
        expect(detectionRequestSchema.safeParse("nope").success).toBe(false);
        expect(detectionRequestSchema.safeParse(null).success).toBe(false);
    });
});

describe("detectorResponseSchema", () => {
    test("parses the worker's documented shape", () => {
        const parsed = detectorResponseSchema.safeParse({
            confidence: 85,
            label: "Human-written",
            reasoning: "Formal tone.",
            model: "@cf/meta/llama-3.1-8b-instruct-fast",
        });

        expect(parsed.success).toBe(true);
    });

    test("accepts a confidence the model returned as a string", () => {
        const parsed = detectorResponseSchema.safeParse({ label: "Mixed", confidence: "60" });

        expect(parsed.success).toBe(true);
    });

    test("accepts the worker's error envelope", () => {
        const parsed = detectorResponseSchema.safeParse({ error: "AI model error: timeout" });

        expect(parsed.success).toBe(true);
    });

    test("tolerates a payload with no recognised fields at all", () => {
        expect(detectorResponseSchema.safeParse({}).success).toBe(true);
    });

    test("rejects a response that is not an object", () => {
        expect(detectorResponseSchema.safeParse("Human-written").success).toBe(false);
    });
});

describe("aiTextDetectorSearchParamsSchema", () => {
    test("carries a passage from a shared link", () => {
        const parsed = aiTextDetectorSearchParamsSchema.parse({ text: "hello" });

        expect(parsed.text).toBe("hello");
    });

    test("degrades an over-long param to the default instead of throwing", () => {
        const parsed = aiTextDetectorSearchParamsSchema.parse({
            text: "a".repeat(MAX_DETECTION_TEXT_LENGTH + 1),
        });

        expect(parsed.text).toBeUndefined();
    });

    test("degrades a repeated param to the default", () => {
        const parsed = aiTextDetectorSearchParamsSchema.parse({ text: ["one", "two"] });

        expect(parsed.text).toBeUndefined();
    });

    test("opens on an empty box when nothing was passed", () => {
        expect(aiTextDetectorSearchParamsSchema.parse({}).text).toBeUndefined();
    });
});
