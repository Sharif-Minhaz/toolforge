import { describe, expect, test } from "bun:test";

import { buildHashExportFilename, createHashExportFile } from "@/modules/hash/domain/export";

const GENERATED_AT = new Date("2026-07-27T10:15:00.000Z");

describe("buildHashExportFilename", () => {
    for (const [mode, expected] of [
        ["generate", "hash-generated-20260727T101500Z.txt"],
        ["compare", "hash-compared-20260727T101500Z.txt"],
    ] as const) {
        test(`names the ${mode} export after what it contains`, () => {
            expect(buildHashExportFilename(mode, GENERATED_AT)).toBe(expected);
        });
    }
});

describe("createHashExportFile", () => {
    test("bundles filename, media type, and body together", () => {
        expect(
            createHashExportFile({
                mode: "generate",
                content: "900150983cd24fb0d6963f7d28e17f72",
                generatedAt: GENERATED_AT,
            }),
        ).toEqual({
            filename: "hash-generated-20260727T101500Z.txt",
            mimeType: "text/plain;charset=utf-8",
            content: "900150983cd24fb0d6963f7d28e17f72\n",
        });
    });

    test("does not add a second trailing newline", () => {
        const file = createHashExportFile({
            mode: "compare",
            content: "match\n",
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe("match\n");
    });

    test("leaves an empty export empty", () => {
        const file = createHashExportFile({
            mode: "generate",
            content: "",
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe("");
    });
});
