import { describe, expect, test } from "bun:test";

import { buildSortExportFilename, createSortExportFile } from "@/modules/sort/domain/export";

const GENERATED_AT = new Date("2026-09-01T10:15:00.000Z");

describe("the exported file", () => {
    test("names the order and the instant, so two downloads are told apart", () => {
        expect(buildSortExportFilename({ order: "ascending", generatedAt: GENERATED_AT })).toBe(
            "toolforge-sorted-ascending-20260901T101500Z.txt",
        );
        expect(buildSortExportFilename({ order: "shuffle", generatedAt: GENERATED_AT })).toBe(
            "toolforge-sorted-shuffle-20260901T101500Z.txt",
        );
    });

    test("ends the file with a newline, the way a text file ends", () => {
        const file = createSortExportFile({
            content: "apple\nbanana",
            order: "ascending",
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe("apple\nbanana\n");
        expect(file.mimeType).toBe("text/plain;charset=utf-8");
    });

    test("does not add a second newline, or one to an empty file", () => {
        const base = { order: "ascending", generatedAt: GENERATED_AT } as const;

        expect(createSortExportFile({ ...base, content: "apple\n" }).content).toBe("apple\n");
        expect(createSortExportFile({ ...base, content: "" }).content).toBe("");
    });
});
