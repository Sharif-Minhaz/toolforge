import { describe, expect, test } from "bun:test";

import { MAX_JSON_DEPTH } from "@/modules/tools/types/json-tree";
import { losesPrecision, parseJson } from "@/modules/tools/domain/json-parser";
import type { JsonErrorCode, JsonNode } from "@/modules/tools/types/json-tree";

function parseStrict(input: string) {
    return parseJson(input, false);
}

function parseLenient(input: string) {
    return parseJson(input, true);
}

/** Narrows to the successful branch so a test can read the tree directly. */
function rootOf(input: string, repair = false): JsonNode {
    const parsed = parseJson(input, repair);

    if (!parsed.ok) {
        throw new Error(`expected a parse, got ${parsed.error.code}`);
    }

    return parsed.root;
}

function errorOf(input: string, repair = false) {
    const parsed = parseJson(input, repair);

    if (parsed.ok) {
        throw new Error("expected a failure");
    }

    return parsed.error;
}

describe("parseJson — the accepted grammar", () => {
    for (const input of [
        "{}",
        "[]",
        '{"a":1}',
        "[1,2,3]",
        '"text"',
        "42",
        "-0",
        "0",
        "true",
        "false",
        "null",
        "1e3",
        "-1.5E-7",
        '{"a":{"b":[1,{"c":null}]}}',
        ' \t\r\n {"a" : 1} \n ',
    ] as const) {
        test(`accepts ${input}`, () => {
            expect(parseStrict(input).ok).toBe(true);
        });
    }
});

describe("parseJson — rejections carry a position", () => {
    for (const [input, code, line, column] of [
        ["", "empty", 1, 1],
        ["   ", "empty", 1, 1],
        ["{", "unexpected_end", 1, 2],
        ['{"a"}', "unexpected_token", 1, 5],
        ['{"a":1,}', "trailing_comma", 1, 7],
        ["[1,]", "trailing_comma", 1, 3],
        ["[1 2]", "missing_comma", 1, 4],
        ['{"a":1 "b":2}', "missing_comma", 1, 8],
        ["{'a':1}", "non_standard_quote", 1, 2],
        ["{a:1}", "unquoted_key", 1, 2],
        ["[NaN]", "non_standard_literal", 1, 2],
        ["[-Infinity]", "non_standard_literal", 1, 2],
        ["[undefined]", "non_standard_literal", 1, 2],
        ["// hi\n{}", "comment", 1, 1],
        ["{} // hi", "comment", 1, 4],
        ['"a\nb"', "control_character", 1, 3],
        ['"\\x41"', "invalid_escape", 1, 2],
        ['"\\u12"', "invalid_escape", 1, 2],
        ['"unclosed', "unterminated_string", 1, 1],
        ["01", "invalid_number", 1, 1],
        ["1.", "invalid_number", 1, 1],
        [".5", "invalid_number", 1, 1],
        ["+5", "invalid_number", 1, 1],
        ["1e", "invalid_number", 1, 1],
        ["0x1f", "invalid_number", 1, 1],
        ["tru", "invalid_literal", 1, 1],
        ["{} {}", "trailing_content", 1, 4],
        ["@", "unexpected_token", 1, 1],
    ] as [string, JsonErrorCode, number, number][]) {
        test(`${JSON.stringify(input)} fails as ${code} at ${line}:${column}`, () => {
            const error = errorOf(input);

            expect(error.code).toBe(code);
            expect(error.line).toBe(line);
            expect(error.column).toBe(column);
        });
    }

    test("counts lines and columns across a multi-line document", () => {
        const error = errorOf('{\n  "a": 1,\n  "b": ,\n}');

        expect(error.line).toBe(3);
        expect(error.column).toBe(8);
    });

    test("counts a column in characters, not UTF-16 units", () => {
        // The rocket is one character to a reader but two code units to the
        // engine. The stray second comma is the 7th character; counting code
        // units instead would report it one place further along, at 8.
        const error = errorOf('["🚀" ,,]');

        expect(error.line).toBe(1);
        expect(error.column).toBe(7);
    });

    test("treats CRLF as one line break", () => {
        const error = errorOf('{\r\n"a" 1\r\n}');

        expect(error.line).toBe(2);
    });
});

describe("parseJson — repair", () => {
    test("accepts a trailing comma in an object and records the fix", () => {
        const parsed = parseLenient('{"a":1,}');

        expect(parsed.ok).toBe(true);
        expect(parsed.ok && parsed.repairs.map((repair) => repair.code)).toEqual([
            "trailing_comma",
        ]);
    });

    test("quotes bare keys", () => {
        expect(rootOf("{a:1, b:2}", true)).toMatchObject({
            kind: "object",
            members: [{ key: "a" }, { key: "b" }],
        });
    });

    test("rewrites single-quoted strings", () => {
        expect(rootOf("{'a':'x'}", true)).toMatchObject({
            kind: "object",
            members: [{ key: "a", value: { kind: "string", value: "x" } }],
        });
    });

    test("rewrites curly quotes left by a word processor", () => {
        expect(rootOf("{“a”:“x”}", true)).toMatchObject({
            kind: "object",
            members: [{ key: "a", value: { kind: "string", value: "x" } }],
        });
    });

    test("strips comments without touching a slash inside a string", () => {
        expect(rootOf('{ // note\n "url": "https://x/y" /* tail */ }', true)).toMatchObject({
            kind: "object",
            members: [{ key: "url", value: { kind: "string", value: "https://x/y" } }],
        });
    });

    test("maps the literals other languages emit onto JSON ones", () => {
        expect(
            rootOf("[True, False, None, NaN, Infinity, -Infinity, undefined]", true),
        ).toMatchObject({
            kind: "array",
            items: [
                { kind: "boolean", value: true },
                { kind: "boolean", value: false },
                { kind: "null" },
                { kind: "null" },
                { kind: "null" },
                { kind: "null" },
                { kind: "null" },
            ],
        });
    });

    test("normalises the number shapes JSON does not allow", () => {
        const root = rootOf("[+5, .5, 5., 007, 0x1f, 1e]", true);
        const raws =
            root.kind === "array"
                ? root.items.map((item) => item.kind === "number" && item.raw)
                : [];

        expect(raws).toEqual(["5", "0.5", "5", "7", "31", "1"]);
    });

    test("infers a comma between members that run together", () => {
        const parsed = parseLenient('{"a":1 "b":2}');

        expect(parsed.ok && parsed.repairs.map((repair) => repair.code)).toEqual(["missing_comma"]);
    });

    test("keeps a raw newline inside a string", () => {
        expect(rootOf('"a\nb"', true)).toMatchObject({ kind: "string", value: "a\nb" });
    });

    test("leaves valid JSON untouched, with nothing to report", () => {
        const parsed = parseLenient('{"a":[1,2]}');

        expect(parsed.ok && parsed.repairs).toEqual([]);
    });

    test("still refuses an unterminated string, which is ambiguous", () => {
        expect(errorOf('{"a": "x', true).code).toBe("unterminated_string");
    });
});

describe("parseJson — advisories", () => {
    test("reports a repeated member name with its position", () => {
        const parsed = parseStrict('{"a":1,\n "a":2}');

        expect(parsed.ok && parsed.advisories).toEqual([
            { code: "duplicate_key", key: "a", line: 2, column: 2, offset: 9 },
        ]);
    });

    test("does not report distinct names", () => {
        const parsed = parseStrict('{"a":1,"b":2}');

        expect(parsed.ok && parsed.advisories).toEqual([]);
    });

    test("reports an integer a double cannot hold", () => {
        const parsed = parseStrict("[12345678901234567890]");

        expect(parsed.ok && parsed.advisories.map((advisory) => advisory.code)).toEqual([
            "precision_loss",
        ]);
    });

    test("reports a lone surrogate", () => {
        const parsed = parseStrict('"\\ud800"');

        expect(parsed.ok && parsed.advisories.map((advisory) => advisory.code)).toEqual([
            "unpaired_surrogate",
        ]);
    });

    test("accepts a well-formed surrogate pair silently", () => {
        const parsed = parseStrict('"\\ud83d\\ude80"');

        expect(parsed.ok && parsed.advisories).toEqual([]);
        expect(rootOf('"\\ud83d\\ude80"')).toMatchObject({ kind: "string", value: "🚀" });
    });
});

describe("parseJson — numbers keep their literal", () => {
    for (const raw of [
        "12345678901234567890",
        "1E400",
        "1e-400",
        "0.1",
        "-0",
        "1.000",
        "2e+3",
        "1e007",
    ] as const) {
        test(`keeps ${raw} exactly as written`, () => {
            const root = rootOf(`[${raw}]`);
            const item = root.kind === "array" ? root.items[0] : undefined;

            expect(item?.kind === "number" && item.raw).toBe(raw);
        });
    }
});

describe("losesPrecision", () => {
    for (const [raw, expected] of [
        ["1", false],
        ["9007199254740992", false],
        ["9007199254740993", true],
        ["12345678901234567890", true],
        ["-9007199254740993", true],
        ["0.1", false],
        ["1e400", true],
        ["1e-400", true],
        ["0", false],
        ["0.0", false],
    ] as [string, boolean][]) {
        test(`${raw} ${expected ? "would round" : "survives"} a double`, () => {
            expect(losesPrecision(raw)).toBe(expected);
        });
    }
});

describe("parseJson — limits", () => {
    test("accepts nesting exactly at the ceiling", () => {
        const input = "[".repeat(MAX_JSON_DEPTH) + "]".repeat(MAX_JSON_DEPTH);

        expect(parseStrict(input).ok).toBe(true);
    });

    test("reports one level past the ceiling instead of overflowing the stack", () => {
        const depth = MAX_JSON_DEPTH + 1;
        const input = "[".repeat(depth) + "]".repeat(depth);

        expect(errorOf(input).code).toBe("too_deep");
    });
});

describe("parseJson — byte order mark", () => {
    test("ignores a leading BOM, as RFC 8259 §8.1 permits", () => {
        expect(parseStrict('﻿{"a":1}').ok).toBe(true);
    });

    test("still rejects a BOM in the middle of a document", () => {
        expect(errorOf('{﻿"a":1}').code).toBe("unexpected_token");
    });
});
