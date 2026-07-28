import { describe, expect, test } from "bun:test";

import {
    buildDetectionFilename,
    createDetectionExportFile,
} from "@/modules/ai-text-detector/domain/export";
import { getTextMetrics } from "@/modules/ai-text-detector/domain/text-metrics";
import type { DetectionVerdict } from "@/modules/ai-text-detector/types";

const GENERATED_AT = new Date("2026-07-28T10:15:00.000Z");

const VERDICT: DetectionVerdict = {
    label: "human-written",
    confidence: 85,
    band: "high",
    reasoning: "The text exhibits a formal tone and a clear structure.",
    model: "@cf/meta/llama-3.1-8b-instruct-fast",
};

describe("buildDetectionFilename", () => {
    test("stamps a sortable timestamp", () => {
        expect(buildDetectionFilename(GENERATED_AT)).toBe("ai-text-report-20260728T101500Z.json");
    });
});

describe("createDetectionExportFile", () => {
    test("writes a JSON report that parses back to the verdict", () => {
        const text = "One two three. Four five.";
        const file = createDetectionExportFile({
            text,
            verdict: VERDICT,
            metrics: getTextMetrics(text),
            generatedAt: GENERATED_AT,
        });

        expect(file.filename).toBe("ai-text-report-20260728T101500Z.json");
        expect(file.mimeType).toBe("application/json;charset=utf-8");

        const parsed: unknown = JSON.parse(file.content);

        expect(parsed).toEqual({
            generatedAt: "2026-07-28T10:15:00.000Z",
            label: "human-written",
            confidence: 85,
            band: "high",
            reasoning: "The text exhibits a formal tone and a clear structure.",
            model: "@cf/meta/llama-3.1-8b-instruct-fast",
            metrics: {
                characters: 25,
                words: 5,
                sentences: 2,
                averageSentenceWords: 2.5,
                uniqueWordRatio: 100,
            },
            text,
        });
    });

    test("terminates the file with a newline", () => {
        const file = createDetectionExportFile({
            text: "anything",
            verdict: VERDICT,
            metrics: getTextMetrics("anything"),
            generatedAt: GENERATED_AT,
        });

        expect(file.content.endsWith("}\n")).toBe(true);
    });
});
