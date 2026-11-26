import { describe, expect, test } from "bun:test";

import {
    buildBijoyExportFilename,
    createBijoyExportFile,
} from "@/modules/bijoy-unicode/domain/export";

const AT = new Date("2026-11-26T10:15:00.000Z");

describe("bijoy export", () => {
    test("names the file after the encoding inside it", () => {
        expect(buildBijoyExportFilename({ direction: "to-unicode", generatedAt: AT })).toBe(
            "toolforge-bangla-unicode-20261126T101500Z.txt",
        );
        expect(buildBijoyExportFilename({ direction: "to-bijoy", generatedAt: AT })).toBe(
            "toolforge-bangla-bijoy-20261126T101500Z.txt",
        );
    });

    test("writes UTF-8 text with one trailing newline", () => {
        const file = createBijoyExportFile({
            content: "আমি",
            direction: "to-unicode",
            generatedAt: AT,
        });

        expect(file.mimeType).toBe("text/plain;charset=utf-8");
        expect(file.content).toBe("আমি\n");
    });

    test("leaves an empty export empty", () => {
        expect(
            createBijoyExportFile({ content: "", direction: "to-bijoy", generatedAt: AT }).content,
        ).toBe("");
    });
});
