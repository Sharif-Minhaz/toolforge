import { describe, expect, test } from "bun:test";

import { buildJsonExportFilename, createJsonExportFile } from "@/modules/json/domain/export";
import type { JsonMode } from "@/modules/json/types";

const GENERATED_AT = new Date("2026-07-27T10:15:00.000Z");

describe("buildJsonExportFilename", () => {
    for (const [mode, expected] of [
        ["beautify", "json-formatted-20260727T101500Z.json"],
        ["minify", "json-minified-20260727T101500Z.json"],
        ["validate", "json-validated-20260727T101500Z.json"],
    ] as [JsonMode, string][]) {
        test(`names a ${mode} export ${expected}`, () => {
            expect(buildJsonExportFilename(mode, GENERATED_AT)).toBe(expected);
        });
    }
});

describe("createJsonExportFile", () => {
    test("declares the JSON media type", () => {
        const file = createJsonExportFile({
            mode: "beautify",
            content: '{"a":1}',
            generatedAt: GENERATED_AT,
        });

        expect(file.mimeType).toBe("application/json");
    });

    test("ends the file with a newline", () => {
        const file = createJsonExportFile({
            mode: "minify",
            content: '{"a":1}',
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe('{"a":1}\n');
    });

    test("does not double the newline that is already there", () => {
        const file = createJsonExportFile({
            mode: "minify",
            content: '{"a":1}\n',
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe('{"a":1}\n');
    });

    test("leaves empty content empty rather than writing a blank line", () => {
        const file = createJsonExportFile({
            mode: "beautify",
            content: "",
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe("");
    });
});
