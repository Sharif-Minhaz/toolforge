import { describe, expect, test } from "bun:test";

import { MAX_IMAGE_REASONING_LENGTH } from "@/modules/ai-image-detector/domain/constants";
import {
    normalizeConfidenceBand,
    toImageVerdict,
} from "@/modules/ai-image-detector/domain/verdict";
import type { ImageConfidenceBand } from "@/modules/ai-image-detector/types";

describe("normalizeConfidenceBand", () => {
    const cases: readonly (readonly [string, ImageConfidenceBand])[] = [
        ["low", "low"],
        ["LOW", "low"],
        ["  Very low ", "low"],
        ["medium", "medium"],
        ["Moderate", "medium"],
        ["high", "high"],
        ["Very High", "high"],
        ["unknown", "unknown"],
        ["fairly sure", "unknown"],
        ["", "unknown"],
    ];

    for (const [raw, expected] of cases) {
        test(`maps ${JSON.stringify(raw)} to ${expected}`, () => {
            expect(normalizeConfidenceBand(raw)).toBe(expected);
        });
    }

    test("falls back to unknown for anything that is not a string", () => {
        expect(normalizeConfidenceBand(undefined)).toBe("unknown");
        expect(normalizeConfidenceBand(null)).toBe("unknown");
        expect(normalizeConfidenceBand(0.9)).toBe("unknown");
        expect(normalizeConfidenceBand({ confidence: "high" })).toBe("unknown");
    });
});

describe("toImageVerdict", () => {
    test("reads a decisive AI-generated answer", () => {
        expect(
            toImageVerdict({
                is_ai_generated: true,
                confidence: "high",
                reasoning: "Melted fingers and impossible shadows.",
            }),
        ).toEqual({
            label: "ai-generated",
            band: "high",
            reasoning: "Melted fingers and impossible shadows.",
        });
    });

    test("reads a decisive authentic answer", () => {
        expect(
            toImageVerdict({
                is_ai_generated: false,
                confidence: "medium",
                reasoning: "Sensor grain.",
            }),
        ).toEqual({ label: "authentic", band: "medium", reasoning: "Sensor grain." });
    });

    test("collapses the worker's own unparseable-reply fallback to unknown", () => {
        // The worker answers `is_ai_generated: false` with `confidence: "unknown"`
        // when the model returned something it could not parse. Reading that
        // `false` as "authentic" would turn a parse failure into a finding.
        expect(
            toImageVerdict({
                is_ai_generated: false,
                confidence: "unknown",
                reasoning: "No response from model.",
            }),
        ).toEqual({ label: "unknown", band: "unknown", reasoning: "No response from model." });
    });

    test("refuses to decide when the band cannot be placed", () => {
        expect(toImageVerdict({ is_ai_generated: true, confidence: "pretty sure" })).toEqual({
            label: "unknown",
            band: "unknown",
            reasoning: "",
        });
    });

    test("refuses to decide when the flag is not a boolean", () => {
        expect(toImageVerdict({ is_ai_generated: "yes", confidence: "high" })).toEqual({
            label: "unknown",
            band: "unknown",
            reasoning: "",
        });
        expect(toImageVerdict({ confidence: "high" })).toEqual({
            label: "unknown",
            band: "unknown",
            reasoning: "",
        });
    });

    test("survives an entirely empty payload", () => {
        expect(toImageVerdict({})).toEqual({ label: "unknown", band: "unknown", reasoning: "" });
    });

    test("collapses runs of whitespace in the reasoning", () => {
        expect(
            toImageVerdict({
                is_ai_generated: true,
                confidence: "low",
                reasoning: "  Odd   lighting.\n\nSmooth   skin.  ",
            }).reasoning,
        ).toBe("Odd lighting. Smooth skin.");
    });

    test("truncates a runaway justification and marks the cut", () => {
        const reasoning = toImageVerdict({
            is_ai_generated: true,
            confidence: "high",
            reasoning: "a".repeat(MAX_IMAGE_REASONING_LENGTH + 200),
        }).reasoning;

        expect(reasoning).toHaveLength(MAX_IMAGE_REASONING_LENGTH + 1);
        expect(reasoning.endsWith("…")).toBe(true);
    });

    test("leaves a justification exactly on the limit intact", () => {
        const reasoning = toImageVerdict({
            is_ai_generated: true,
            confidence: "high",
            reasoning: "a".repeat(MAX_IMAGE_REASONING_LENGTH),
        }).reasoning;

        expect(reasoning).toHaveLength(MAX_IMAGE_REASONING_LENGTH);
        expect(reasoning.endsWith("…")).toBe(false);
    });

    test("reads a non-string justification as no justification", () => {
        expect(
            toImageVerdict({ is_ai_generated: true, confidence: "high", reasoning: 42 }).reasoning,
        ).toBe("");
    });
});
