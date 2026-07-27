import { describe, expect, test } from "bun:test";

import {
    buildMarkdownExportFilename,
    createMarkdownExportFile,
} from "@/modules/markdown/domain/export";

const GENERATED_AT = new Date("2026-07-28T10:15:00.000Z");

describe("buildMarkdownExportFilename", () => {
    test("stamps the filename so exports sort by time", () => {
        expect(buildMarkdownExportFilename("markdown", GENERATED_AT)).toBe(
            "markdown-20260728T101500Z.md",
        );
    });

    test("uses the extension the format implies", () => {
        expect(buildMarkdownExportFilename("html", GENERATED_AT)).toBe(
            "markdown-20260728T101500Z.html",
        );
    });
});

describe("createMarkdownExportFile — markdown", () => {
    test("exports the source untouched, with a closing newline", () => {
        const file = createMarkdownExportFile({
            format: "markdown",
            source: "# Title",
            title: "Title",
            includeMathStyles: false,
            generatedAt: GENERATED_AT,
        });

        expect(file).toEqual({
            filename: "markdown-20260728T101500Z.md",
            mimeType: "text/markdown;charset=utf-8",
            content: "# Title\n",
        });
    });

    test("does not add a second newline to a document that has one", () => {
        const file = createMarkdownExportFile({
            format: "markdown",
            source: "# Title\n",
            title: "Title",
            includeMathStyles: false,
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe("# Title\n");
    });

    test("exports an empty document as an empty file", () => {
        const file = createMarkdownExportFile({
            format: "markdown",
            source: "",
            title: "Untitled",
            includeMathStyles: false,
            generatedAt: GENERATED_AT,
        });

        expect(file.content).toBe("");
    });
});

describe("createMarkdownExportFile — html", () => {
    function html(overrides: {
        title?: string;
        renderedHtml?: string;
        includeMathStyles?: boolean;
    }) {
        return createMarkdownExportFile({
            format: "html",
            source: "ignored",
            renderedHtml: overrides.renderedHtml ?? "<h1>Title</h1>",
            title: overrides.title ?? "Title",
            includeMathStyles: overrides.includeMathStyles ?? false,
            generatedAt: GENERATED_AT,
        }).content;
    }

    test("wraps the rendered markup in a standalone document", () => {
        const content = html({});

        expect(content.startsWith("<!doctype html>")).toBe(true);
        expect(content).toContain('<meta charset="utf-8">');
        expect(content).toContain("<h1>Title</h1>");
        expect(content.trimEnd().endsWith("</html>")).toBe(true);
    });

    test("escapes the title, which comes from the author's first heading", () => {
        expect(html({ title: 'A <script> & "quotes"' })).toContain(
            "<title>A &lt;script&gt; &amp; &quot;quotes&quot;</title>",
        );
    });

    test("leaves the maths stylesheet out of a document with no maths", () => {
        expect(html({})).not.toContain("katex");
    });

    test("links the maths stylesheet only when the document needs it", () => {
        expect(html({ includeMathStyles: true })).toContain("katex.min.css");
    });

    test("carries the right MIME type for the browser to open it", () => {
        const file = createMarkdownExportFile({
            format: "html",
            source: "",
            renderedHtml: "",
            title: "Untitled",
            includeMathStyles: false,
            generatedAt: GENERATED_AT,
        });

        expect(file.mimeType).toBe("text/html;charset=utf-8");
    });

    test("survives a document that rendered to nothing", () => {
        expect(html({ renderedHtml: "" })).toContain("<body>");
    });
});
