import { describe, expect, test } from "bun:test";

import {
    buildImageReportFilename,
    createImageReportFile,
} from "@/modules/ai-image-detector/domain/export";
import type { ImageDetectionExportRequest } from "@/modules/ai-image-detector/types";

const GENERATED_AT = new Date("2026-07-29T10:15:00.000Z");

function buildRequest(
    overrides: Partial<ImageDetectionExportRequest> = {},
): ImageDetectionExportRequest {
    return {
        facts: {
            name: "holiday.jpg",
            type: "image/jpeg",
            bytes: 482_311,
            width: 1920,
            height: 1080,
        },
        verdict: {
            label: "ai-generated",
            band: "high",
            reasoning: "Impossible shadows.",
        },
        generatedAt: GENERATED_AT,
        ...overrides,
    };
}

describe("buildImageReportFilename", () => {
    test("stamps a sortable, punctuation-free instant", () => {
        expect(buildImageReportFilename(GENERATED_AT)).toBe(
            "ai-image-report-20260729T101500Z.json",
        );
    });

    test("sorts lexicographically in the order the reports were made", () => {
        const earlier = buildImageReportFilename(new Date("2026-07-29T09:00:00.000Z"));
        const later = buildImageReportFilename(new Date("2026-07-29T11:00:00.000Z"));

        expect([later, earlier].sort()).toEqual([earlier, later]);
    });
});

describe("createImageReportFile", () => {
    test("names the file after the instant and declares JSON", () => {
        const file = createImageReportFile(buildRequest());

        expect(file.filename).toBe("ai-image-report-20260729T101500Z.json");
        expect(file.mimeType).toBe("application/json;charset=utf-8");
    });

    test("records the verdict and what was judged", () => {
        const file = createImageReportFile(buildRequest());
        const parsed = JSON.parse(file.content);

        expect(parsed).toEqual({
            generatedAt: "2026-07-29T10:15:00.000Z",
            label: "ai-generated",
            confidence: "high",
            reasoning: "Impossible shadows.",
            image: {
                name: "holiday.jpg",
                type: "image/jpeg",
                bytes: 482_311,
                width: 1920,
                height: 1080,
            },
        });
    });

    test("never embeds the picture itself", () => {
        expect(createImageReportFile(buildRequest()).content).not.toContain("base64");
    });

    test("ends with a newline, so the file concatenates cleanly", () => {
        expect(createImageReportFile(buildRequest()).content.endsWith("\n")).toBe(true);
    });

    test("keeps undecoded dimensions as null rather than inventing zeroes", () => {
        const file = createImageReportFile(
            buildRequest({
                facts: {
                    name: "odd.bmp",
                    type: "image/bmp",
                    bytes: 12,
                    width: null,
                    height: null,
                },
            }),
        );

        const parsed = JSON.parse(file.content);

        expect(parsed.image.width).toBeNull();
        expect(parsed.image.height).toBeNull();
    });

    test("survives an inconclusive verdict with no justification", () => {
        const file = createImageReportFile(
            buildRequest({ verdict: { label: "unknown", band: "unknown", reasoning: "" } }),
        );

        const parsed = JSON.parse(file.content);

        expect(parsed.label).toBe("unknown");
        expect(parsed.confidence).toBe("unknown");
        expect(parsed.reasoning).toBe("");
    });
});
