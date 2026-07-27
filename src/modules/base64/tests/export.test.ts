import { describe, expect, test } from "bun:test";

import { buildBase64ExportFilename, createBase64ExportFile } from "@/modules/base64/domain/export";

const GENERATED_AT = new Date("2026-07-27T10:15:00.000Z");

describe("buildBase64ExportFilename", () => {
    for (const [mode, expected] of [
        ["encode", "base64-encoded-20260727T101500Z.txt"],
        ["decode", "base64-decoded-20260727T101500Z.txt"],
    ] as const) {
        test(`names the ${mode} export after what it contains`, () => {
            expect(buildBase64ExportFilename(mode, GENERATED_AT)).toBe(expected);
        });
    }
});

describe("createBase64ExportFile", () => {
    test("bundles filename, media type, and body together", () => {
        expect(
            createBase64ExportFile({
                mode: "encode",
                content: "Zm9vYmFy",
                generatedAt: GENERATED_AT,
            }),
        ).toEqual({
            filename: "base64-encoded-20260727T101500Z.txt",
            mimeType: "text/plain;charset=utf-8",
            content: "Zm9vYmFy\n",
        });
    });

    test("does not add a second trailing newline", () => {
        const file = createBase64ExportFile({
            mode: "decode",
            content: "foobar\n",
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe("foobar\n");
    });

    test("leaves an empty export empty", () => {
        const file = createBase64ExportFile({
            mode: "encode",
            content: "",
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe("");
    });
});
