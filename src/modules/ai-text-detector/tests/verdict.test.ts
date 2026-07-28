import { describe, expect, test } from "bun:test";

import { CONFIDENCE_BAND_THRESHOLDS } from "@/modules/ai-text-detector/domain/constants";
import {
    clampConfidence,
    normalizeDetectionLabel,
    toConfidenceBand,
    toDetectionVerdict,
} from "@/modules/ai-text-detector/domain/verdict";
import type { ConfidenceBand, DetectionLabel } from "@/modules/ai-text-detector/types";

describe("normalizeDetectionLabel", () => {
    const cases: readonly (readonly [string, DetectionLabel])[] = [
        ["AI-generated", "ai-generated"],
        ["ai generated", "ai-generated"],
        ["  AI_GENERATED  ", "ai-generated"],
        ["Machine-generated", "ai-generated"],
        ["Human-written", "human-written"],
        ["human", "human-written"],
        ["Mixed", "mixed"],
        ["AI-assisted", "mixed"],
        ["Unknown", "unknown"],
        ["definitely a robot", "unknown"],
        ["", "unknown"],
    ];

    for (const [raw, expected] of cases) {
        test(`maps ${JSON.stringify(raw)} to ${expected}`, () => {
            expect(normalizeDetectionLabel(raw)).toBe(expected);
        });
    }

    test("falls back to unknown for anything that is not a string", () => {
        expect(normalizeDetectionLabel(undefined)).toBe("unknown");
        expect(normalizeDetectionLabel(null)).toBe("unknown");
        expect(normalizeDetectionLabel(42)).toBe("unknown");
        expect(normalizeDetectionLabel({ label: "AI-generated" })).toBe("unknown");
    });
});

describe("clampConfidence", () => {
    test("keeps a plain integer intact", () => {
        expect(clampConfidence(85)).toBe(85);
    });

    test("reads a numeric string", () => {
        expect(clampConfidence("85")).toBe(85);
    });

    test("rounds a fractional score", () => {
        expect(clampConfidence(85.4)).toBe(85);
        expect(clampConfidence(85.5)).toBe(86);
    });

    test("clamps outside the 0–100 range", () => {
        expect(clampConfidence(140)).toBe(100);
        expect(clampConfidence(-20)).toBe(0);
    });

    test("reads anything unusable as zero rather than as certainty", () => {
        expect(clampConfidence("very sure")).toBe(0);
        expect(clampConfidence(Number.NaN)).toBe(0);
        expect(clampConfidence(Number.POSITIVE_INFINITY)).toBe(0);
        expect(clampConfidence(undefined)).toBe(0);
        expect(clampConfidence(null)).toBe(0);
    });
});

describe("toConfidenceBand", () => {
    const cases: readonly (readonly [number, ConfidenceBand])[] = [
        [0, "low"],
        [CONFIDENCE_BAND_THRESHOLDS.moderate - 1, "low"],
        [CONFIDENCE_BAND_THRESHOLDS.moderate, "moderate"],
        [CONFIDENCE_BAND_THRESHOLDS.high - 1, "moderate"],
        [CONFIDENCE_BAND_THRESHOLDS.high, "high"],
        [100, "high"],
    ];

    for (const [confidence, expected] of cases) {
        test(`${confidence} reads as ${expected}`, () => {
            expect(toConfidenceBand(confidence)).toBe(expected);
        });
    }
});

describe("toDetectionVerdict", () => {
    test("maps a well-formed worker payload", () => {
        expect(
            toDetectionVerdict({
                confidence: 85,
                label: "Human-written",
                reasoning: "The text exhibits a formal tone and a clear structure.",
                model: "@cf/meta/llama-3.1-8b-instruct-fast",
            }),
        ).toEqual({
            label: "human-written",
            confidence: 85,
            band: "high",
            reasoning: "The text exhibits a formal tone and a clear structure.",
            model: "@cf/meta/llama-3.1-8b-instruct-fast",
        });
    });

    test("collapses whitespace in the reasoning", () => {
        const verdict = toDetectionVerdict({
            label: "Mixed",
            confidence: 60,
            reasoning: "  Some\n\nreasoning   here.  ",
        });

        expect(verdict.reasoning).toBe("Some reasoning here.");
    });

    test("truncates a runaway justification", () => {
        const verdict = toDetectionVerdict({
            label: "AI-generated",
            confidence: 90,
            reasoning: "x".repeat(900),
        });

        expect(verdict.reasoning.endsWith("…")).toBe(true);
        expect(verdict.reasoning.length).toBeLessThanOrEqual(601);
    });

    test("an unplaceable label never carries confidence with it", () => {
        expect(toDetectionVerdict({ label: "banana", confidence: 99 })).toEqual({
            label: "unknown",
            confidence: 0,
            band: "low",
            reasoning: "",
            model: "",
        });
    });

    test("survives a payload with nothing in it", () => {
        expect(toDetectionVerdict({})).toEqual({
            label: "unknown",
            confidence: 0,
            band: "low",
            reasoning: "",
            model: "",
        });
    });
});
