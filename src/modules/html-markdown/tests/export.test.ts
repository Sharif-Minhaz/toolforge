import { describe, expect, test } from "bun:test";

import {
    buildHtmlMarkdownExportFilename,
    createHtmlMarkdownExportFile,
} from "@/modules/html-markdown/domain/export";

const AT = new Date("2026-08-21T10:15:00.000Z");

describe("buildHtmlMarkdownExportFilename", () => {
    test("names the file after what came out, not what went in", () => {
        expect(buildHtmlMarkdownExportFilename("htmlToMarkdown", AT)).toBe(
            "converted-20260821T101500Z.md",
        );
        expect(buildHtmlMarkdownExportFilename("markdownToHtml", AT)).toBe(
            "converted-20260821T101500Z.html",
        );
    });

    test("stamps a sortable instant with no separators to trip a filesystem", () => {
        expect(buildHtmlMarkdownExportFilename("htmlToMarkdown", AT)).not.toContain(":");
    });
});

describe("createHtmlMarkdownExportFile", () => {
    test("carries the media type the extension promises", () => {
        expect(
            createHtmlMarkdownExportFile({
                mode: "htmlToMarkdown",
                content: "# Hi",
                generatedAt: AT,
            }).mimeType,
        ).toBe("text/markdown;charset=utf-8");
        expect(
            createHtmlMarkdownExportFile({
                mode: "markdownToHtml",
                content: "<h1>Hi</h1>",
                generatedAt: AT,
            }).mimeType,
        ).toBe("text/html;charset=utf-8");
    });

    test("ends the file with a newline, the way every other text file ends", () => {
        expect(
            createHtmlMarkdownExportFile({
                mode: "htmlToMarkdown",
                content: "# Hi",
                generatedAt: AT,
            }).content,
        ).toBe("# Hi\n");
    });

    test("does not add a second newline to content that already has one", () => {
        expect(
            createHtmlMarkdownExportFile({
                mode: "markdownToHtml",
                content: "<h1>Hi</h1>\n",
                generatedAt: AT,
            }).content,
        ).toBe("<h1>Hi</h1>\n");
    });

    test("leaves an empty conversion empty rather than writing a blank line", () => {
        expect(
            createHtmlMarkdownExportFile({
                mode: "htmlToMarkdown",
                content: "",
                generatedAt: AT,
            }).content,
        ).toBe("");
    });
});
