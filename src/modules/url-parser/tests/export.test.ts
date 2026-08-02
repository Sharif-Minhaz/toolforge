import { describe, expect, test } from "bun:test";

import {
    buildUrlParserExportFilename,
    buildUrlParserJson,
    createUrlParserExportFile,
} from "@/modules/url-parser/domain/export";
import { parseUrl } from "@/modules/url-parser/domain/parse";
import { URL_PART_IDS, type UrlParseSuccess } from "@/modules/url-parser/types";

const GENERATED_AT = new Date("2026-08-02T10:15:00.000Z");

function parsed(input: string): UrlParseSuccess {
    const result = parseUrl(input);

    if (!result.ok) {
        throw new Error(`expected ${input} to parse`);
    }

    return result;
}

describe("url parser export", () => {
    test("stamps the filename so downloads sort by when they were made", () => {
        expect(buildUrlParserExportFilename(GENERATED_AT)).toBe("url-parts-20260802T101500Z.json");
    });

    test("writes the parts in the order the tool lists them", () => {
        const json = buildUrlParserJson(parsed("https://example.com/a?x=1#top"));
        const keys = Object.keys((JSON.parse(json) as { parts: Record<string, string> }).parts);

        expect(keys).toEqual([...URL_PART_IDS]);
    });

    test("carries the normalised href, every part and every parameter", () => {
        const json = JSON.parse(buildUrlParserJson(parsed("HTTPS://Example.com/a?x=1&x=2#top")));

        expect(json).toEqual({
            href: "https://example.com/a?x=1&x=2#top",
            parts: {
                protocol: "https:",
                username: "",
                password: "",
                hostname: "example.com",
                port: "",
                path: "/a",
                query: "?x=1&x=2",
                fragment: "#top",
                origin: "https://example.com",
            },
            params: [
                { key: "x", value: "1" },
                { key: "x", value: "2" },
            ],
        });
    });

    test("hands back JSON with a trailing newline", () => {
        const file = createUrlParserExportFile({
            parsed: parsed("https://example.com/"),
            generatedAt: GENERATED_AT,
        });

        expect(file.mimeType).toBe("application/json;charset=utf-8");
        expect(file.content.endsWith("}\n")).toBe(true);
        expect(file.content).toBe(`${buildUrlParserJson(parsed("https://example.com/"))}\n`);
    });

    test("writes an empty parameter list rather than leaving the key out", () => {
        const json = JSON.parse(buildUrlParserJson(parsed("https://example.com/")));

        expect(json.params).toEqual([]);
    });
});
