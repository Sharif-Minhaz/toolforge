import { describe, expect, test } from "bun:test";

import { buildUrlExportFilename, createUrlExportFile } from "@/modules/url/domain/export";

const GENERATED_AT = new Date("2026-07-28T10:15:00.000Z");

describe("buildUrlExportFilename", () => {
    test("names an encoded export after its direction and moment", () => {
        expect(buildUrlExportFilename("encode", GENERATED_AT)).toBe(
            "url-encoded-20260728T101500Z.txt",
        );
    });

    test("names a decoded export the same way", () => {
        expect(buildUrlExportFilename("decode", GENERATED_AT)).toBe(
            "url-decoded-20260728T101500Z.txt",
        );
    });

    test("sorts chronologically as plain text", () => {
        const earlier = buildUrlExportFilename("encode", new Date("2026-07-28T09:00:00.000Z"));
        const later = buildUrlExportFilename("encode", GENERATED_AT);

        expect([later, earlier].toSorted()).toEqual([earlier, later]);
    });
});

describe("createUrlExportFile", () => {
    test("writes plain UTF-8 text", () => {
        expect(
            createUrlExportFile({ mode: "encode", content: "a%20b", generatedAt: GENERATED_AT }),
        ).toEqual({
            filename: "url-encoded-20260728T101500Z.txt",
            mimeType: "text/plain;charset=utf-8",
            content: "a%20b\n",
        });
    });

    test("does not double up a newline the content already ends with", () => {
        expect(
            createUrlExportFile({ mode: "decode", content: "a b\n", generatedAt: GENERATED_AT })
                .content,
        ).toBe("a b\n");
    });

    test("leaves an empty export empty rather than writing a lone newline", () => {
        expect(
            createUrlExportFile({ mode: "encode", content: "", generatedAt: GENERATED_AT }).content,
        ).toBe("");
    });
});
