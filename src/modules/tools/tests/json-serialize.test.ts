import { describe, expect, test } from "bun:test";

import { parseJson } from "@/modules/tools/domain/json-parser";
import { encodeJsonString, serializeJson } from "@/modules/tools/domain/json-serialize";
import type { JsonNode, JsonSerializeOptions } from "@/modules/tools/types/json-tree";

const PLAIN: JsonSerializeOptions = { indent: "", sortKeys: false, escapeUnicode: false };

function tree(input: string): JsonNode {
    const parsed = parseJson(input, false);

    if (!parsed.ok) {
        throw new Error(`fixture does not parse: ${parsed.error.code}`);
    }

    return parsed.root;
}

function render(input: string, overrides: Partial<JsonSerializeOptions> = {}): string {
    return serializeJson(tree(input), { ...PLAIN, ...overrides });
}

describe("serializeJson — minified", () => {
    for (const [input, expected] of [
        ['{ "a" : 1 }', '{"a":1}'],
        ["[ 1 , 2 ]", "[1,2]"],
        ["{}", "{}"],
        ["[]", "[]"],
        ['{"a":{},"b":[]}', '{"a":{},"b":[]}'],
        ['  "text"  ', '"text"'],
        ["  true ", "true"],
    ] as [string, string][]) {
        test(`${input} minifies to ${expected}`, () => {
            expect(render(input)).toBe(expected);
        });
    }
});

describe("serializeJson — beautified", () => {
    test("matches JSON.stringify's shape at two spaces", () => {
        const value = { a: 1, b: [1, 2], c: { d: "x" }, e: null, f: true };
        const input = JSON.stringify(value);

        expect(render(input, { indent: "  " })).toBe(JSON.stringify(value, null, 2));
    });

    test("matches JSON.stringify's shape at four spaces", () => {
        const value = { a: [{ b: [] }, {}], c: "x" };

        expect(render(JSON.stringify(value), { indent: "    " })).toBe(
            JSON.stringify(value, null, 4),
        );
    });

    test("matches JSON.stringify's shape with tabs", () => {
        const value = { a: { b: { c: 1 } } };

        expect(render(JSON.stringify(value), { indent: "\t" })).toBe(
            JSON.stringify(value, null, "\t"),
        );
    });

    test("keeps an empty container on one line", () => {
        expect(render('{"a":{},"b":[]}', { indent: "  " })).toBe('{\n  "a": {},\n  "b": []\n}');
    });
});

describe("serializeJson — key order", () => {
    test("preserves document order by default", () => {
        expect(render('{"b":1,"a":2,"C":3}')).toBe('{"b":1,"a":2,"C":3}');
    });

    test("sorts by code point when asked, so uppercase leads", () => {
        expect(render('{"b":1,"a":2,"C":3}', { sortKeys: true })).toBe('{"C":3,"a":2,"b":1}');
    });

    test("sorts nested objects too", () => {
        expect(render('{"b":{"z":1,"y":2},"a":3}', { sortKeys: true })).toBe(
            '{"a":3,"b":{"y":2,"z":1}}',
        );
    });

    test("keeps both halves of a repeated name", () => {
        expect(render('{"a":1,"a":2}')).toBe('{"a":1,"a":2}');
    });

    test("orders a supplementary-plane key after every BMP one", () => {
        // Sorting by UTF-16 unit would put the rocket's lead surrogate (U+D83D)
        // before U+FFFD instead of after it.
        expect(render('{"🚀":1,"�":2}', { sortKeys: true })).toBe('{"�":2,"🚀":1}');
    });
});

describe("serializeJson — numbers survive the trip", () => {
    for (const raw of ["12345678901234567890", "1e400", "0.1", "-0", "1.000", "2e+3"] as const) {
        test(`writes ${raw} back unchanged`, () => {
            expect(render(`[${raw}]`)).toBe(`[${raw}]`);
        });
    }

    test("does not round a 20-digit id the way JSON.parse would", () => {
        const id = "12345678901234567890";

        expect(render(`{"id":${id}}`)).toBe(`{"id":${id}}`);
        expect(JSON.stringify(JSON.parse(`{"id":${id}}`))).not.toBe(`{"id":${id}}`);
    });
});

describe("encodeJsonString", () => {
    for (const [value, expected] of [
        ["", '""'],
        ["plain", '"plain"'],
        ['say "hi"', '"say \\"hi\\""'],
        ["back\\slash", '"back\\\\slash"'],
        ["line\nbreak", '"line\\nbreak"'],
        ["tab\there", '"tab\\there"'],
        ["bell", '"bell\\u0007"'],
        ["a/b", '"a/b"'],
        ["café", '"café"'],
        ["🚀", '"🚀"'],
    ] as [string, string][]) {
        test(`encodes ${JSON.stringify(value)}`, () => {
            expect(encodeJsonString(value, false)).toBe(expected);
        });
    }

    test("agrees with JSON.stringify on every ASCII code point", () => {
        for (let code = 0; code < 128; code += 1) {
            const char = String.fromCharCode(code);

            expect(encodeJsonString(char, false)).toBe(JSON.stringify(char));
        }
    });

    test("escapes a lone surrogate even when ASCII output was not asked for", () => {
        expect(encodeJsonString("\ud800", false)).toBe('"\\ud800"');
    });

    test("rewrites non-ASCII as \\u escapes when asked", () => {
        expect(encodeJsonString("café", true)).toBe('"caf\\u00e9"');
        expect(encodeJsonString("🚀", true)).toBe('"\\ud83d\\ude80"');
    });

    test("leaves ASCII alone under escapeUnicode", () => {
        expect(encodeJsonString("plain text", true)).toBe('"plain text"');
    });
});

describe("serializeJson — round trip", () => {
    for (const input of [
        '{"a":1,"b":[true,false,null],"c":{"d":"e"}}',
        "[[[[1]]]]",
        '{"unicode":"héllo 🚀","escaped":"\\u0001"}',
        "[]",
        '"just a string"',
    ] as const) {
        test(`re-reads its own output for ${input}`, () => {
            const once = render(input);
            const twice = render(once);

            expect(twice).toBe(once);
            expect(JSON.parse(once)).toEqual(JSON.parse(input));
        });
    }
});
