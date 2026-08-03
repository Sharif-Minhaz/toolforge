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
    type TokenKind,
} from "@/modules/curl/domain/highlight";

function kinds(input: string, language: "shell" | "javascript"): TokenKind[] {
    return highlight(input, language).map((token) => token.kind);
}

function textOf(input: string, language: "shell" | "javascript"): string {
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
