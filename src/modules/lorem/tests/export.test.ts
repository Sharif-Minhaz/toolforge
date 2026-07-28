import { describe, expect, test } from "bun:test";

import {
    buildLoremFilename,
    createLoremExportFile,
    getLoremMimeType,
} from "@/modules/lorem/domain/export";
import { LOREM_FORMATS } from "@/modules/lorem/types";

const GENERATED_AT = new Date("2026-07-28T10:15:00.000Z");

describe("buildLoremFilename", () => {
    test("stamps the source and a sortable timestamp", () => {
        expect(buildLoremFilename("kafka", "plain", GENERATED_AT)).toBe(
            "random-text-kafka-20260728T101500Z.txt",
        );
    });

    test("uses the extension the chosen format actually produces", () => {
        expect(buildLoremFilename("lorem", "html", GENERATED_AT)).toBe(
            "random-text-lorem-20260728T101500Z.html",
        );
    });

    test("keeps a hyphenated source id readable in the filename", () => {
        expect(buildLoremFilename("far-far-away", "plain", GENERATED_AT)).toBe(
            "random-text-far-far-away-20260728T101500Z.txt",
        );
    });
});

describe("getLoremMimeType", () => {
    test("names a charset for every format, so no browser has to guess", () => {
        for (const format of LOREM_FORMATS) {
            expect(getLoremMimeType(format)).toContain("charset=utf-8");
        }
    });

    test("marks html as html rather than plain text", () => {
        expect(getLoremMimeType("html")).toBe("text/html;charset=utf-8");
        expect(getLoremMimeType("plain")).toBe("text/plain;charset=utf-8");
    });
});

describe("createLoremExportFile", () => {
    test("terminates the content with a newline", () => {
        const file = createLoremExportFile({
            text: "Lorem ipsum dolor sit amet.",
            format: "plain",
            source: "lorem",
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe("Lorem ipsum dolor sit amet.\n");
        expect(file.mimeType).toBe("text/plain;charset=utf-8");
        expect(file.filename).toBe("random-text-lorem-20260728T101500Z.txt");
    });

    test("leaves an empty result genuinely empty", () => {
        const file = createLoremExportFile({
            text: "",
            format: "html",
            source: "emoji",
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe("");
    });
});
