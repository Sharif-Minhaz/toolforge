import { describe, expect, test } from "bun:test";

import {
    MAX_DETECTION_TEXT_LENGTH,
    MIN_DETECTION_TEXT_LENGTH,
} from "@/modules/ai-text-detector/domain/constants";
import {
    charactersRemaining,
    checkDetectionText,
} from "@/modules/ai-text-detector/domain/text-check";

const AT_MINIMUM = "a".repeat(MIN_DETECTION_TEXT_LENGTH);

describe("checkDetectionText", () => {
    test("accepts a passage exactly at the minimum", () => {
        expect(checkDetectionText(AT_MINIMUM)).toEqual({
            ok: true,
            text: AT_MINIMUM,
            length: MIN_DETECTION_TEXT_LENGTH,
        });
    });

    test("rejects one character below the minimum", () => {
        expect(checkDetectionText("a".repeat(MIN_DETECTION_TEXT_LENGTH - 1))).toEqual({
            ok: false,
            reason: "too_short",
            length: MIN_DETECTION_TEXT_LENGTH - 1,
        });
    });

    test("accepts a passage exactly at the maximum", () => {
        const result = checkDetectionText("a".repeat(MAX_DETECTION_TEXT_LENGTH));

        expect(result.ok).toBe(true);
        expect(result.length).toBe(MAX_DETECTION_TEXT_LENGTH);
    });

    test("rejects one character above the maximum", () => {
        expect(checkDetectionText("a".repeat(MAX_DETECTION_TEXT_LENGTH + 1))).toEqual({
            ok: false,
            reason: "too_long",
            length: MAX_DETECTION_TEXT_LENGTH + 1,
        });
    });

    test("treats whitespace-only input as empty rather than too short", () => {
        expect(checkDetectionText("   \n\t  ")).toEqual({ ok: false, reason: "empty", length: 0 });
    });

    test("measures the trimmed passage, and hands the trimmed copy on", () => {
        const padded = `\n\n  ${AT_MINIMUM}  \n`;

        expect(checkDetectionText(padded)).toEqual({
            ok: true,
            text: AT_MINIMUM,
            length: MIN_DETECTION_TEXT_LENGTH,
        });
    });

    test("padding alone never carries a passage over the minimum", () => {
        const short = "a".repeat(MIN_DETECTION_TEXT_LENGTH - 5);

        expect(checkDetectionText(`     ${short}     `).ok).toBe(false);
    });
});

describe("charactersRemaining", () => {
    test("counts down to the minimum", () => {
        expect(charactersRemaining("")).toBe(MIN_DETECTION_TEXT_LENGTH);
        expect(charactersRemaining("abc")).toBe(MIN_DETECTION_TEXT_LENGTH - 3);
    });

    test("bottoms out at zero once the passage is long enough", () => {
        expect(charactersRemaining(AT_MINIMUM)).toBe(0);
        expect(charactersRemaining("a".repeat(MAX_DETECTION_TEXT_LENGTH))).toBe(0);
    });

    test("ignores surrounding whitespace", () => {
        expect(charactersRemaining("  abc  ")).toBe(MIN_DETECTION_TEXT_LENGTH - 3);
    });
});
