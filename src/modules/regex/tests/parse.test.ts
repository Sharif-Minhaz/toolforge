import { describe, expect, test } from "bun:test";

import { parsePattern, walkNodes } from "@/modules/regex/domain/parse";
import type { RegexNode, RegexNodeKind } from "@/modules/regex/types";

function flatten(pattern: string, options?: { extended: boolean }): RegexNode[] {
    const collected: RegexNode[] = [];
    walkNodes(parsePattern(pattern, options).root, (node) => collected.push(node));

    return collected;
}

function kinds(pattern: string): RegexNodeKind[] {
    return flatten(pattern).map((node) => node.kind);
}

function topLevel(pattern: string): readonly RegexNode[] {
    return parsePattern(pattern).root.children ?? [];
}

describe("parsePattern", () => {
    test("merges an unquantified run of literals into one node", () => {
        const [node, ...rest] = topLevel("abc");

        expect(rest).toHaveLength(0);
        expect(node.kind).toBe("literal");
        expect(node.value).toBe("abc");
        expect([node.start, node.end]).toEqual([0, 3]);
    });

    test("leaves a quantified literal out of the preceding run", () => {
        const nodes = topLevel("abc+");

        expect(nodes.map((node) => node.value)).toEqual(["ab", "c"]);
        expect(nodes[1].quantifier?.min).toBe(1);
        expect(nodes[1].quantifier?.max).toBeNull();
    });

    test("reads every quantifier form", () => {
        const cases: readonly {
            readonly source: string;
            readonly min: number;
            readonly max: number | null;
        }[] = [
            { source: "a*", min: 0, max: null },
            { source: "a+", min: 1, max: null },
            { source: "a?", min: 0, max: 1 },
            { source: "a{3}", min: 3, max: 3 },
            { source: "a{3,}", min: 3, max: null },
            { source: "a{2,6}", min: 2, max: 6 },
        ];

        for (const { source, min, max } of cases) {
            const quantifier = topLevel(source)[0].quantifier;

            expect(quantifier?.min).toBe(min);
            expect(quantifier?.max).toBe(max);
            expect(quantifier?.greedy).toBe(true);
            expect(quantifier?.possessive).toBe(false);
        }
    });

    test("distinguishes greedy, lazy, and possessive", () => {
        expect(topLevel("a+")[0].quantifier).toMatchObject({ greedy: true, possessive: false });
        expect(topLevel("a+?")[0].quantifier).toMatchObject({ greedy: false, possessive: false });
        expect(topLevel("a++")[0].quantifier).toMatchObject({ greedy: true, possessive: true });
    });

    test("treats a brace that is not a repetition as a literal", () => {
        const nodes = topLevel("a{x}");

        expect(nodes).toHaveLength(1);
        expect(nodes[0].value).toBe("a{x}");
        expect(nodes[0].quantifier).toBeUndefined();
    });

    test("numbers capture groups by opening parenthesis", () => {
        const { groups } = parsePattern("(a(?:b)(c(?<year>d)))");

        expect(groups).toEqual([
            { index: 1, name: null },
            { index: 2, name: null },
            { index: 3, name: "year" },
        ]);
    });

    test("recognises every group opening", () => {
        const cases: readonly { readonly source: string; readonly kind: RegexNodeKind }[] = [
            { source: "(a)", kind: "captureGroup" },
            { source: "(?:a)", kind: "nonCapturingGroup" },
            { source: "(?<n>a)", kind: "namedGroup" },
            { source: "(?P<n>a)", kind: "namedGroup" },
            { source: "(?=a)", kind: "lookahead" },
            { source: "(?!a)", kind: "lookahead" },
            { source: "(?<=a)", kind: "lookbehind" },
            { source: "(?<!a)", kind: "lookbehind" },
            { source: "(?>a)", kind: "atomicGroup" },
            { source: "(?#note)", kind: "comment" },
            { source: "(?R)", kind: "recursion" },
            { source: "(?i)", kind: "modifierGroup" },
            { source: "(?i:a)", kind: "modifierGroup" },
        ];

        for (const { source, kind } of cases) {
            expect(topLevel(source)[0].kind).toBe(kind);
            expect(topLevel(source)[0].end).toBe(source.length);
        }
    });

    test("marks negated lookaround", () => {
        expect(topLevel("(?!a)")[0].negated).toBe(true);
        expect(topLevel("(?=a)")[0].negated).toBe(false);
        expect(topLevel("(?<!a)")[0].negated).toBe(true);
    });

    test("parses character classes, ranges, and negation", () => {
        const characterClass = topLevel("[^a-z\\d.]")[0];

        expect(characterClass.kind).toBe("characterClass");
        expect(characterClass.negated).toBe(true);
        expect((characterClass.children ?? []).map((child) => child.kind)).toEqual([
            "classRange",
            "shorthand",
            "literal",
        ]);
    });

    test("a trailing hyphen in a class is a hyphen, not a range", () => {
        const members = topLevel("[a-]")[0].children ?? [];

        expect(members.map((member) => member.kind)).toEqual(["literal", "literal"]);
        expect(members.map((member) => member.value)).toEqual(["a", "-"]);
    });

    test("a hyphen after a shorthand is a hyphen", () => {
        const members = topLevel("[\\w-]")[0].children ?? [];

        expect(members.map((member) => member.kind)).toEqual(["shorthand", "literal"]);
    });

    test("\\b is a boundary in a pattern and a backspace in a class", () => {
        expect(topLevel("\\b")[0].kind).toBe("wordBoundary");
        expect((topLevel("[\\b]")[0].children ?? [])[0]).toMatchObject({
            kind: "controlEscape",
            detail: "backspace",
        });
    });

    test("reads the escape forms", () => {
        expect(topLevel("\\d")[0]).toMatchObject({
            kind: "shorthand",
            detail: "d",
            negated: false,
        });
        expect(topLevel("\\S")[0]).toMatchObject({ kind: "shorthand", detail: "s", negated: true });
        expect(topLevel("\\n")[0]).toMatchObject({ kind: "controlEscape", value: "\n" });
        expect(topLevel("\\x41")[0]).toMatchObject({ kind: "hexEscape", value: "A" });
        expect(topLevel("\\u0041")[0]).toMatchObject({ kind: "unicodeEscape", value: "A" });
        expect(topLevel("\\u{1F600}")[0]).toMatchObject({ kind: "unicodeEscape", value: "😀" });
        expect(topLevel("\\p{L}")[0]).toMatchObject({ kind: "unicodeProperty", detail: "L" });
        expect(topLevel("\\P{L}")[0]).toMatchObject({ kind: "unicodeProperty", negated: true });
        expect(topLevel("\\3")[0]).toMatchObject({ kind: "backreference", detail: "3" });
        expect(topLevel("\\k<year>")[0]).toMatchObject({
            kind: "namedBackreference",
            detail: "year",
        });
        expect(topLevel("\\.")[0]).toMatchObject({ kind: "escapedLiteral", value: "." });
    });

    test("splits alternation into branches", () => {
        const root = parsePattern("ab|cd|ef").root;

        expect(root.kind).toBe("alternation");
        expect(root.children).toHaveLength(3);
    });

    test("an empty branch is still a branch", () => {
        expect(parsePattern("a|").root.children).toHaveLength(2);
    });

    test("consumes an astral character as one literal", () => {
        const nodes = topLevel("😀");

        expect(nodes).toHaveLength(1);
        expect(nodes[0].value).toBe("😀");
        expect(nodes[0].end).toBe(2);
    });

    test("under x, whitespace and # comments become inert nodes", () => {
        const collected = flatten("a b # note", { extended: true }).map((node) => node.kind);

        expect(collected).toContain("ignorableWhitespace");
        expect(collected).toContain("comment");
    });

    test("without x, a space is an ordinary character", () => {
        expect(kinds("a b")).not.toContain("ignorableWhitespace");
    });

    describe("stays total on malformed input", () => {
        const malformed = [
            "(",
            ")",
            "(()",
            "[a",
            "[",
            "a\\",
            "*",
            "+abc",
            "a{2,",
            "(?<",
            "(?",
            "\\u{",
            "\\p{",
            "[a-",
            "|",
            "((((((((((",
            "]",
            "a)b",
        ];

        for (const pattern of malformed) {
            test(JSON.stringify(pattern), () => {
                const { root } = parsePattern(pattern);

                expect(root.end).toBe(pattern.length);
            });
        }
    });

    test("node spans never run backwards or past the pattern", () => {
        const patterns = [
            String.raw`^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,6}$`,
            String.raw`(?<year>\d{4})-(?<month>\d{2})`,
            String.raw`a(?:b|c)*d\1\k<x>[^\]]`,
        ];

        for (const pattern of patterns) {
            for (const node of flatten(pattern)) {
                expect(node.start).toBeLessThanOrEqual(node.end);
                expect(node.end).toBeLessThanOrEqual(pattern.length);
            }
        }
    });
});
