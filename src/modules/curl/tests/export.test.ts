import { describe, expect, test } from "bun:test";

import { buildCurlExportFilename, createCurlExportFile } from "@/modules/curl/domain/export";

const AT = new Date("2026-08-03T10:15:00.000Z");

describe("buildCurlExportFilename", () => {
    test("names the language it holds and stamps it sortably", () => {
        expect(buildCurlExportFilename("curlToCode", "fetch", AT)).toBe(
            "request-fetch-20260803T101500Z.js",
        );
        expect(buildCurlExportFilename("curlToCode", "axios", AT)).toBe(
            "request-axios-20260803T101500Z.js",
        );
        expect(buildCurlExportFilename("curlToCode", "nodeHttp", AT)).toBe(
            "request-node-https-20260803T101500Z.js",
        );
    });

    test("names the command a shell script, whatever the code target says", () => {
        expect(buildCurlExportFilename("codeToCurl", "axios", AT)).toBe(
            "request-curl-20260803T101500Z.sh",
        );
    });
});

describe("createCurlExportFile", () => {
    test("gives a command the interpreter line it needs to run", () => {
        expect(
            createCurlExportFile({
                direction: "codeToCurl",
                target: "fetch",
                content: "curl https://example.com",
                generatedAt: AT,
            }),
        ).toEqual({
            filename: "request-curl-20260803T101500Z.sh",
            mimeType: "text/x-shellscript;charset=utf-8",
            content: "#!/bin/sh\ncurl https://example.com\n",
        });
    });

    test("leaves a snippet as written, since it is pasted rather than run", () => {
        const file = createCurlExportFile({
            direction: "curlToCode",
            target: "fetch",
            content: 'await fetch("https://example.com");',
            generatedAt: AT,
        });

        expect(file.mimeType).toBe("text/javascript;charset=utf-8");
        expect(file.content).toBe('await fetch("https://example.com");\n');
    });

    test("exports nothing at all without a trailing newline", () => {
        for (const direction of ["curlToCode", "codeToCurl"] as const) {
            const file = createCurlExportFile({
                direction,
                target: "fetch",
                content: "",
                generatedAt: AT,
            });

            expect(file.content).toEndWith("\n");
        }
    });
});
