import { describe, expect, test } from "bun:test";

import {
    SAMPLE_CURL,
    SAMPLE_FETCH,
    DEFAULT_CODE_OPTIONS,
    DEFAULT_CURL_OPTIONS,
} from "@/modules/curl/domain/constants";
import { convert } from "@/modules/curl/domain/convert";
import {
    highlight,
    HIGHLIGHT_LANGUAGES,
    MAX_HIGHLIGHT_LENGTH,
    type HighlightLanguage,
    type TokenKind,
} from "@/modules/tools/domain/highlight";

function kinds(input: string, language: HighlightLanguage): TokenKind[] {
    return highlight(input, language).map((token) => token.kind);
}

function textOf(input: string, language: HighlightLanguage): string {
    return highlight(input, language)
        .map((token) => token.text)
        .join("");
}

/**
 * The one invariant everything else rests on. The highlighted text is painted
 * behind a transparent textarea, so a character lost or gained shifts every
 * glyph after it and the caret stops landing where it points.
 */
describe("highlight — reproduces its input exactly", () => {
    const AWKWARD = [
        "",
        " ",
        "\n\n\n",
        "curl https://example.com",
        SAMPLE_CURL,
        SAMPLE_FETCH,
        `curl -d '{"a":"it'\\''s"}' https://x`,
        'curl -d "unterminated',
        "const a = `template ${with} holes`;",
        "// comment with no newline",
        "/* unterminated block",
        "$'\\n\\t'",
        "→ unicode ← 日本語 😀",
        "a\\b\\c ^ ` #",
        "{[()]},;:.=+-*/%<>!?&|~^",
        "0x1f 1_000 1.5e-3 .5",
        "'''",
        '"""',
        "\\",
        "^",
        // JSON, TOON and hex, including the half-typed shapes a highlighter
        // behind a caret meets far more often than the well-formed ones.
        '{"a":1,"b":[true,null,-1.5e3],"$oid":"ff"}',
        '{"a": ',
        '{"unterminated',
        '{"escaped\\"quote": "x"}',
        "users[2]{id,name}:\n  1,Ada\n  2,Bob",
        "envs[2:]{region}:\n  production: eu-1",
        "rows[2|]{a|b}:\n  1|2",
        "# a comment line\nkey: value",
        "items[2]:\n  - 1\n  - name: Ada",
        "  deeply:\n    nested: true",
        'key: "a, b"',
        "[]{}:",
        "3c000000075f69640064b7c0f0e1a2b3c4d5e6f70800",
        "3c00\n0000 075f",
        "not hex at all",
    ];

    for (const language of HIGHLIGHT_LANGUAGES) {
        test(`for every awkward input, in ${language}`, () => {
            for (const input of AWKWARD) {
                expect(textOf(input, language)).toBe(input);
            }
        });
    }

    test("for everything this tool can emit", () => {
        for (const [direction, input] of [
            ["curlToCode", SAMPLE_CURL],
            ["codeToCurl", SAMPLE_FETCH],
        ] as const) {
            for (const target of ["fetch", "axios", "nodeHttp"] as const) {
                const result = convert({
                    direction,
                    input,
                    code: { ...DEFAULT_CODE_OPTIONS, target },
                    curl: DEFAULT_CURL_OPTIONS,
                });

                expect(result.ok).toBe(true);

                if (result.ok) {
                    const language = direction === "curlToCode" ? "javascript" : "shell";

                    expect(textOf(result.output, language)).toBe(result.output);
                }
            }
        }
    });

    test("never emits an empty token", () => {
        for (const language of HIGHLIGHT_LANGUAGES) {
            for (const input of AWKWARD) {
                for (const token of highlight(input, language)) {
                    expect(token.text.length).toBeGreaterThan(0);
                }
            }
        }
    });

    test("even past the ceiling, where it stops colouring", () => {
        const huge = `curl 'https://example.com' -H 'X: ${"a".repeat(MAX_HIGHLIGHT_LENGTH)}'`;

        expect(highlight(huge, "shell")).toEqual([{ kind: "plain", text: huge }]);
        expect(textOf(huge, "shell")).toBe(huge);
    });

    test("merges adjacent runs of one kind rather than emitting a span each", () => {
        const tokens = highlight("plain words here", "shell");

        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toEqual({ kind: "plain", text: "plain words here" });
    });

    test("colours nothing at all under the plain language", () => {
        expect(highlight("anything {at} all", "plain")).toEqual([
            { kind: "plain", text: "anything {at} all" },
        ]);
    });
});

describe("highlight — json", () => {
    /**
     * The one distinction that matters on this site: a string before a colon is
     * a key. Half the keys a reader here sees are `$oid` and `$numberLong`, and
     * colouring those as values makes a BSON document unreadable at a glance.
     */
    test("separates a key from a string value by what follows it", () => {
        expect(highlight('{"a":"b"}', "json")).toEqual([
            { kind: "punctuation", text: "{" },
            { kind: "property", text: '"a"' },
            { kind: "punctuation", text: ":" },
            { kind: "string", text: '"b"' },
            { kind: "punctuation", text: "}" },
        ]);
    });

    test("sees the key even with whitespace before the colon", () => {
        expect(kinds('{"a" : 1}', "json")).toEqual([
            "punctuation",
            "property",
            "plain",
            "punctuation",
            "plain",
            "number",
            "punctuation",
        ]);
    });

    test("reads literals and every number shape", () => {
        expect(kinds("[true,false,null,-1,0.5,2e10,-1.5e-3]", "json")).toEqual([
            "punctuation",
            "keyword",
            "punctuation",
            "keyword",
            "punctuation",
            "keyword",
            "punctuation",
            "number",
            "punctuation",
            "number",
            "punctuation",
            "number",
            "punctuation",
            "number",
            "punctuation",
        ]);
    });

    test("keeps an escaped quote inside the string it belongs to", () => {
        expect(highlight('"a\\"b"', "json")).toEqual([{ kind: "string", text: '"a\\"b"' }]);
    });

    test("colours an unterminated string rather than giving up on the line", () => {
        expect(kinds('{"a": "unterminated', "json")).toEqual([
            "punctuation",
            "property",
            "punctuation",
            "plain",
            "string",
        ]);
    });
});

describe("highlight — toon", () => {
    // Adjacent punctuation arrives merged — `]{` and `}:` are one token each,
    // because the sink joins runs of one kind rather than emitting a span per
    // character. Same colour either way; a great deal less DOM.
    test("splits a tabular header into key, length, fields and colon", () => {
        expect(highlight("users[2]{id,name}:", "toon")).toEqual([
            { kind: "property", text: "users" },
            { kind: "punctuation", text: "[" },
            { kind: "number", text: "2" },
            { kind: "punctuation", text: "]{" },
            { kind: "property", text: "id" },
            { kind: "punctuation", text: "," },
            { kind: "property", text: "name" },
            { kind: "punctuation", text: "}:" },
        ]);
    });

    test("reads the keyed-tabular marker and a non-comma delimiter in the header", () => {
        expect(textOf("envs[2:]{region}:", "toon")).toBe("envs[2:]{region}:");
        expect(highlight("rows[2|]{a|b}:", "toon")).toEqual([
            { kind: "property", text: "rows" },
            { kind: "punctuation", text: "[" },
            { kind: "number", text: "2" },
            // The delimiter is scoped by repeating it inside the length marker,
            // so `|]{` is three punctuation characters in a row.
            { kind: "punctuation", text: "|]{" },
            { kind: "property", text: "a" },
            { kind: "punctuation", text: "|" },
            { kind: "property", text: "b" },
            { kind: "punctuation", text: "}:" },
        ]);
    });

    test("colours a row's cells the way JSON scalars are coloured", () => {
        expect(highlight("  1,Ada,true", "toon")).toEqual([
            { kind: "plain", text: "  " },
            { kind: "number", text: "1" },
            { kind: "punctuation", text: "," },
            { kind: "plain", text: "Ada" },
            { kind: "punctuation", text: "," },
            { kind: "keyword", text: "true" },
        ]);
    });

    test("treats a full-line hash as the comment TOON's decoder strips", () => {
        expect(highlight("  # note\nkey: 1", "toon")).toEqual([
            { kind: "plain", text: "  " },
            { kind: "comment", text: "# note" },
            { kind: "plain", text: "\n" },
            { kind: "property", text: "key" },
            { kind: "punctuation", text: ":" },
            { kind: "plain", text: " " },
            { kind: "number", text: "1" },
        ]);
    });

    test("marks a list item's dash without swallowing what follows it", () => {
        expect(kinds("  - 1", "toon")).toEqual(["plain", "punctuation", "number"]);
        expect(kinds("  - name: Ada", "toon")).toEqual([
            "plain",
            "punctuation",
            "property",
            "punctuation",
            "plain",
        ]);
    });

    test("leaves a quoted value quoted, delimiter and all", () => {
        expect(highlight('key: "a, b"', "toon")).toEqual([
            { kind: "property", text: "key" },
            { kind: "punctuation", text: ":" },
            { kind: "plain", text: " " },
            { kind: "string", text: '"a, b"' },
        ]);
    });
});

describe("highlight — hex", () => {
    /**
     * Hex has no syntax. The only two things worth finding in a BSON dump are
     * the declared length it opens with — the number the "header declares N
     * bytes" failure is about — and the terminator it closes with.
     */
    test("marks the four-byte length header and the terminating null", () => {
        const tokens = highlight("3c000000075f696400ff00", "hex");

        expect(tokens).toEqual([
            { kind: "number", text: "3c000000" },
            { kind: "plain", text: "075f696400ff" },
            { kind: "punctuation", text: "00" },
        ]);
    });

    test("keeps its bearings across the whitespace a pasted dump carries", () => {
        expect(textOf("3c00\n0000 075f696400ff00", "hex")).toBe("3c00\n0000 075f696400ff00");
        expect(kinds("3c00\n0000 075f696400ff00", "hex")).toEqual([
            "number",
            "plain",
            "number",
            "plain",
            "punctuation",
        ]);
    });

    test("colours nothing when the text is not a plausible document", () => {
        expect(highlight("not hex at all", "hex")).toEqual([
            { kind: "plain", text: "not hex at all" },
        ]);
        expect(highlight("3c00", "hex")).toEqual([{ kind: "plain", text: "3c00" }]);
    });
});

describe("highlight — shell", () => {
    test("marks the command, its flags and the address", () => {
        expect(highlight("curl -L https://example.com", "shell")).toEqual([
            { kind: "command", text: "curl" },
            { kind: "plain", text: " " },
            { kind: "flag", text: "-L" },
            { kind: "plain", text: " " },
            { kind: "url", text: "https://example.com" },
        ]);
    });

    test("keeps the quotes inside the string run", () => {
        expect(highlight("-H 'Accept: */*'", "shell")).toEqual([
            { kind: "flag", text: "-H" },
            { kind: "plain", text: " " },
            { kind: "string", text: "'Accept: */*'" },
        ]);
    });

    test("reads a dollar-quoted run as one string", () => {
        expect(kinds("$'a\\nb'", "shell")).toEqual(["string"]);
    });

    test("marks a continuation mark but not an ordinary escape", () => {
        expect(kinds("curl \\\n-L", "shell")).toEqual([
            "command",
            "plain",
            "operator",
            "plain",
            "flag",
        ]);
        expect(kinds("a\\bc", "shell")).toEqual(["plain", "operator", "plain"]);
    });

    test("does not mistake a hyphen mid-word for a flag", () => {
        // Two tokens, not three: the space and the word are both plain, and the
        // sink merges them.
        expect(highlight("curl x-y", "shell")).toEqual([
            { kind: "command", text: "curl" },
            { kind: "plain", text: " x-y" },
        ]);
    });

    test("marks a comment only where a word may start", () => {
        expect(kinds("# note", "shell")).toEqual(["comment"]);
        expect(kinds("https://x#frag", "shell")).toEqual(["url"]);
    });
});

describe("highlight — javascript", () => {
    test("separates keywords, functions, properties and strings", () => {
        expect(highlight('const r = await fetch("u");', "javascript")).toEqual([
            { kind: "keyword", text: "const" },
            { kind: "plain", text: " r " },
            { kind: "operator", text: "=" },
            { kind: "plain", text: " " },
            { kind: "keyword", text: "await" },
            { kind: "plain", text: " " },
            { kind: "function", text: "fetch" },
            { kind: "punctuation", text: "(" },
            { kind: "string", text: '"u"' },
            { kind: "punctuation", text: ");" },
        ]);
    });

    test("marks an object key as a property", () => {
        expect(kinds("{ method: 1 }", "javascript")).toEqual([
            "punctuation",
            "plain",
            "property",
            "punctuation",
            "plain",
            "number",
            "plain",
            "punctuation",
        ]);
    });

    test("marks a member access as a property", () => {
        expect(kinds("response.status", "javascript")).toEqual([
            "plain",
            "punctuation",
            "property",
        ]);
    });

    test("treats the literal constants as values, not identifiers", () => {
        expect(kinds("true false null undefined", "javascript")).toEqual([
            "number",
            "plain",
            "number",
            "plain",
            "number",
            "plain",
            "number",
        ]);
    });

    test("swallows a template's holes rather than splitting the run", () => {
        expect(highlight("`a ${b} c`", "javascript")).toEqual([
            { kind: "string", text: "`a ${b} c`" },
        ]);
    });

    test("reads both comment forms", () => {
        expect(kinds("// one\n/* two */", "javascript")).toEqual(["comment", "plain", "comment"]);
    });
});
