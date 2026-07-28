import { describe, expect, test } from "bun:test";

import { toHighlightSpans } from "@/modules/regex/domain/highlight";
import { parsePattern } from "@/modules/regex/domain/parse";
import type { HighlightKind } from "@/modules/regex/types";

function spansOf(pattern: string, extended = false) {
    return toHighlightSpans(pattern, parsePattern(pattern, { extended }).root);
}

function kindAt(pattern: string, index: number): HighlightKind | undefined {
    return spansOf(pattern).find((span) => span.start <= index && index < span.end)?.kind;
}

const PATTERNS = [
    String.raw`^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,6}$`,
    String.raw`(?<year>\d{4})-(?<month>\d{2})-(\d{2})`,
    String.raw`\bfoo|bar\b`,
    String.raw`a(?:b|c)*?d`,
    String.raw`[^\]\\]+`,
    String.raw`\p{Script=Greek}+`,
    String.raw`(a)\1\k<n>`,
    "",
    "(",
    "[a",
    "a\\",
    "😀+",
];

describe("toHighlightSpans", () => {
    // The highlighted layer sits behind a transparent input. If the spans do
    // not concatenate back into the pattern, every character after the first
    // discrepancy is painted under the wrong glyph.
    test("the spans reassemble the pattern exactly", () => {
        for (const pattern of PATTERNS) {
            const rebuilt = spansOf(pattern)
                .map((span) => pattern.slice(span.start, span.end))
                .join("");

            expect(rebuilt).toBe(pattern);
        }
    });

    test("spans are ordered, non-empty, and never overlap", () => {
        for (const pattern of PATTERNS) {
            let cursor = 0;

            for (const span of spansOf(pattern)) {
                expect(span.start).toBe(cursor);
                expect(span.end).toBeGreaterThan(span.start);
                cursor = span.end;
            }

            expect(cursor).toBe(pattern.length);
        }
    });

    test("an empty pattern produces no spans", () => {
        expect(spansOf("")).toEqual([]);
    });

    test("paints each construct with its own kind", () => {
        const pattern = String.raw`^[\w-]+@x{2,6}$`;

        expect(kindAt(pattern, 0)).toBe("anchor"); // ^
        expect(kindAt(pattern, 1)).toBe("charClass"); // [
        expect(kindAt(pattern, 2)).toBe("escape"); // \w
        expect(kindAt(pattern, 4)).toBe("plain"); // -
        expect(kindAt(pattern, 5)).toBe("charClass"); // ]
        expect(kindAt(pattern, 6)).toBe("quantifier"); // +
        expect(kindAt(pattern, 7)).toBe("plain"); // @
        expect(kindAt(pattern, 9)).toBe("quantifier"); // {2,6}
        expect(kindAt(pattern, pattern.length - 1)).toBe("anchor"); // $
    });

    test("paints group delimiters without swallowing the body", () => {
        const pattern = "(?<year>ab)";

        expect(kindAt(pattern, 0)).toBe("group");
        expect(kindAt(pattern, 7)).toBe("group");
        expect(kindAt(pattern, 8)).toBe("plain");
        expect(kindAt(pattern, 10)).toBe("group");
    });

    test("paints the alternation bar", () => {
        expect(kindAt("ab|cd", 2)).toBe("alternation");
    });

    test("paints backreferences apart from escapes", () => {
        expect(kindAt(String.raw`(a)\1`, 3)).toBe("backreference");
    });

    test("paints inert whitespace and comments under x", () => {
        const pattern = "a b # note";
        const commented = toHighlightSpans(pattern, parsePattern(pattern, { extended: true }).root);

        expect(commented.some((span) => span.kind === "comment")).toBe(true);
    });
});
