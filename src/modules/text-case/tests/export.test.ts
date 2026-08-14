import { describe, expect, test } from "bun:test";

import {
    buildTextCaseExportFilename,
    createTextCaseExportFile,
} from "@/modules/text-case/domain/export";

const AT = new Date("2026-08-14T10:15:00.000Z");

describe("text case export", () => {
    test("names the file after the case and the instant", () => {
        expect(buildTextCaseExportFilename({ textCase: "constant", generatedAt: AT })).toBe(
            "toolforge-text-constant-20260814T101500Z.txt",
        );
    });

    test("writes plain UTF-8 text", () => {
        const file = createTextCaseExportFile({
            content: "HELLO",
            textCase: "upper",
            generatedAt: AT,
        });

        expect(file.mimeType).toBe("text/plain;charset=utf-8");
        expect(file.content).toBe("HELLO\n");
    });

    test("adds a trailing newline only where one is missing", () => {
        const ending = createTextCaseExportFile({
            content: "one\ntwo\n",
            textCase: "lower",
            generatedAt: AT,
        });

        expect(ending.content).toBe("one\ntwo\n");
    });

    test("leaves an empty export empty rather than writing a lone newline", () => {
        const empty = createTextCaseExportFile({
            content: "",
            textCase: "lower",
            generatedAt: AT,
        });

        expect(empty.content).toBe("");
    });
});
