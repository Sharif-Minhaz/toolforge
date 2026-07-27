import { describe, expect, test } from "bun:test";

import {
    MAX_HIGHLIGHT_LENGTH,
    tokenizeJson,
    type JsonToken,
    type JsonTokenKind,
} from "@/modules/json/domain/highlight";
import { DEFAULT_FORMAT_OPTIONS, SAMPLE_JSON } from "@/modules/json/domain/constants";
import { formatJson } from "@/modules/json/domain/format";

function kinds(source: string): JsonTokenKind[] {
    return tokenizeJson(source).map((token) => token.kind);
}

function textOf(tokens: readonly JsonToken[]): string {
    return tokens.map((token) => token.text).join("");
}

describe("tokenizeJson — every character survives", () => {
    for (const source of [
        "",
        "{}",
        '{\n  "a": 1\n}',
        '[1,"two",true,null,{"k":[]}]',
        '{\n\t"deep": {\n\t\t"er": [1, 2]\n\t}\n}',
        '"a string with \\"escaped\\" quotes and a : colon"',
        "-1.5e-7",
    ] as const) {
        test(`rejoins to the original for ${JSON.stringify(source)}`, () => {
            expect(textOf(tokenizeJson(source))).toBe(source);
        });
    }

    test("rejoins the real formatter output", () => {
        const result = formatJson({
            mode: "beautify",
            input: SAMPLE_JSON,
            options: DEFAULT_FORMAT_OPTIONS,
        });

        if (!result.ok) {
            throw new Error(result.error.code);
        }

        expect(textOf(tokenizeJson(result.output))).toBe(result.output);
    });
});

describe("tokenizeJson — classification", () => {
    test("separates a member name from a string value", () => {
        expect(tokenizeJson('{"a":"b"}')).toEqual([
            { kind: "punctuation", text: "{" },
            { kind: "key", text: '"a"' },
            { kind: "punctuation", text: ":" },
            { kind: "string", text: '"b"' },
            { kind: "punctuation", text: "}" },
        ]);
    });

    test("still sees a member name across the whitespace a pretty print adds", () => {
        expect(kinds('{\n  "a" : 1\n}')).toEqual([
            "punctuation",
            "plain",
            "key",
            "plain",
            "punctuation",
            "plain",
            "number",
            "plain",
            "punctuation",
        ]);
    });

    test("does not mistake a string in an array for a name", () => {
        expect(kinds('["a","b"]')).toEqual([
            "punctuation",
            "string",
            "punctuation",
            "string",
            "punctuation",
        ]);
    });

    test("is not fooled by a colon inside a string", () => {
        expect(tokenizeJson('["http://x"]')[1]).toEqual({ kind: "string", text: '"http://x"' });
    });

    test("is not fooled by an escaped quote", () => {
        expect(tokenizeJson('"say \\"hi\\""')).toEqual([
            { kind: "string", text: '"say \\"hi\\""' },
        ]);
    });

    test("keeps a whole number literal in one token", () => {
        expect(tokenizeJson("[-1.5e-7]")[1]).toEqual({ kind: "number", text: "-1.5e-7" });
    });

    test("does not swallow the comma after a number", () => {
        expect(kinds("[1,2]")).toEqual([
            "punctuation",
            "number",
            "punctuation",
            "number",
            "punctuation",
        ]);
    });

    test("keeps a 20-digit literal whole", () => {
        expect(tokenizeJson("[12345678901234567890]")[1]).toEqual({
            kind: "number",
            text: "12345678901234567890",
        });
    });

    test("tells booleans and null apart", () => {
        expect(kinds("[true,false,null]")).toEqual([
            "punctuation",
            "boolean",
            "punctuation",
            "boolean",
            "punctuation",
            "null",
            "punctuation",
        ]);
    });

    test("merges a whitespace run into a single plain token", () => {
        const tokens = tokenizeJson('{\n\n\n  "a": 1\n}');

        expect(tokens.filter((token) => token.kind === "plain")).toHaveLength(3);
    });
});

describe("tokenizeJson — degradation", () => {
    test("returns nothing for an empty document", () => {
        expect(tokenizeJson("")).toEqual([]);
    });

    test("does not throw on text that is not JSON at all", () => {
        expect(textOf(tokenizeJson("not json @ all"))).toBe("not json @ all");
    });

    test("closes an unterminated string at the end of the input", () => {
        expect(tokenizeJson('"unclosed')).toEqual([{ kind: "string", text: '"unclosed' }]);
    });

    test("falls back to one plain run past the highlight ceiling", () => {
        const huge = `["${"a".repeat(MAX_HIGHLIGHT_LENGTH)}"]`;
        const tokens = tokenizeJson(huge);

        expect(tokens).toHaveLength(1);
        expect(tokens[0].kind).toBe("plain");
        expect(tokens[0].text).toBe(huge);
    });

    test("still colours a document exactly at the ceiling", () => {
        const padding = MAX_HIGHLIGHT_LENGTH - 4;
        const exact = `["${"a".repeat(padding)}"]`;

        expect(exact).toHaveLength(MAX_HIGHLIGHT_LENGTH);
        expect(kinds(exact)).toEqual(["punctuation", "string", "punctuation"]);
    });
});
