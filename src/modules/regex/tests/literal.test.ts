import { describe, expect, test } from "bun:test";

import { formatLiteral, parseLiteral } from "@/modules/regex/domain/literal";
import { REGEX_DELIMITERS } from "@/modules/regex/types";

describe("formatLiteral", () => {
    test("wraps the pattern and appends the flags", () => {
        expect(formatLiteral("a+", ["global", "multiline"], "slash")).toBe("/a+/gm");
    });

    test("escapes the delimiter, and only the delimiter", () => {
        expect(formatLiteral("a/b~c", [], "slash")).toBe(String.raw`/a\/b~c/`);
        expect(formatLiteral("a/b~c", [], "tilde")).toBe(String.raw`~a/b\~c~`);
    });

    test("writes flags in display order", () => {
        expect(formatLiteral("a", ["sticky", "global"], "at")).toBe("@a@gy");
    });

    test("no flags means no trailing letters", () => {
        expect(formatLiteral("a", [], "hash")).toBe("#a#");
    });
});

describe("parseLiteral", () => {
    test("reads a slash literal back", () => {
        expect(parseLiteral("/a+/gm")).toEqual({
            pattern: "a+",
            flags: ["global", "multiline"],
            delimiter: "slash",
        });
    });

    test("unescapes the delimiter", () => {
        expect(parseLiteral(String.raw`/a\/b/`)?.pattern).toBe("a/b");
    });

    test("round-trips through every delimiter", () => {
        for (const delimiter of REGEX_DELIMITERS) {
            const literal = formatLiteral("a.b+c", ["global", "ignoreCase"], delimiter);

            expect(parseLiteral(literal)).toEqual({
                pattern: "a.b+c",
                flags: ["global", "ignoreCase"],
                delimiter,
            });
        }
    });

    test("tolerates surrounding whitespace", () => {
        expect(parseLiteral("  /a/g  ")?.pattern).toBe("a");
    });

    // The overwhelmingly common paste is a bare pattern, and rewriting one as
    // though it were a literal would silently eat characters.
    describe("returns null for anything that is not a complete literal", () => {
        const rejected = [
            "a+",
            "",
            "/",
            "/unterminated",
            "/usr/local/bin",
            String.raw`^\d+$`,
            "/a/gq",
            "/a/global",
        ];

        for (const input of rejected) {
            test(JSON.stringify(input), () => {
                expect(parseLiteral(input)).toBeNull();
            });
        }
    });

    test("accepts flags in any order", () => {
        expect(parseLiteral("/a/mg")?.flags).toEqual(["global", "multiline"]);
    });

    test("rejects a repeated flag letter", () => {
        expect(parseLiteral("/a/gg")).toBeNull();
    });

    test("an empty pattern between delimiters is still a literal", () => {
        expect(parseLiteral("//g")).toEqual({ pattern: "", flags: ["global"], delimiter: "slash" });
    });
});
