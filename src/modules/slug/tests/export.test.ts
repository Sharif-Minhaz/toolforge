import { describe, expect, test } from "bun:test";

import { buildSlugExportFilename, createSlugExportFile } from "@/modules/slug/domain/export";

const GENERATED_AT = new Date("2026-08-02T10:15:00.000Z");

describe("slug export", () => {
    test("stamps the filename so downloads sort by when they were made", () => {
        expect(buildSlugExportFilename(GENERATED_AT)).toBe("slugs-20260802T101500Z.txt");
    });

    test("hands back plain UTF-8 text", () => {
        const file = createSlugExportFile({
            content: "how-to-learn-html",
            generatedAt: GENERATED_AT,
        });

        expect(file.mimeType).toBe("text/plain;charset=utf-8");
        expect(file.content).toBe("how-to-learn-html\n");
    });

    test("adds a trailing newline only when one is missing", () => {
        expect(
            createSlugExportFile({ content: "one\ntwo\n", generatedAt: GENERATED_AT }).content,
        ).toBe("one\ntwo\n");
    });

    test("leaves an empty export empty rather than writing a lone newline", () => {
        expect(createSlugExportFile({ content: "", generatedAt: GENERATED_AT }).content).toBe("");
    });
});
