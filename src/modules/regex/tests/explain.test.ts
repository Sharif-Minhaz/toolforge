import { describe, expect, test } from "bun:test";

import { toExplanation, type ExplainContext } from "@/modules/regex/domain/explain";
import { parsePattern } from "@/modules/regex/domain/parse";
import type { ExplanationDetail, ExplanationNode } from "@/modules/regex/types";

const PLAIN: ExplainContext = { multiline: false, dotAll: false };

function explain(pattern: string, context: ExplainContext = PLAIN): readonly ExplanationNode[] {
    return toExplanation(pattern, parsePattern(pattern).root, context);
}

function kinds(nodes: readonly ExplanationNode[]): ExplanationDetail["kind"][] {
    return nodes.map((node) => node.detail.kind);
}

function flatten(nodes: readonly ExplanationNode[]): ExplanationNode[] {
    return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

describe("toExplanation", () => {
    test("an empty pattern explains nothing", () => {
        expect(explain("")).toEqual([]);
    });

    test("every line quotes the pattern slice it describes", () => {
        const pattern = String.raw`^[\w.-]+@\d{2,6}$`;

        for (const line of flatten(explain(pattern))) {
            expect(pattern).toContain(line.source);
            expect(line.source.length).toBeGreaterThan(0);
        }
    });

    test("ids are unique, so React keys never collide", () => {
        const lines = flatten(explain(String.raw`(a|b|)(?<n>c)+\1[x-z]`));
        const ids = lines.map((line) => line.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    test("anchors change meaning with the m flag", () => {
        expect(kinds(explain("^"))).toEqual(["anchorStartString"]);
        expect(kinds(explain("^", { ...PLAIN, multiline: true }))).toEqual(["anchorStartLine"]);
        expect(kinds(explain("$"))).toEqual(["anchorEndString"]);
        expect(kinds(explain("$", { ...PLAIN, multiline: true }))).toEqual(["anchorEndLine"]);
    });

    test("the dot changes meaning with the s flag", () => {
        expect(kinds(explain("."))).toEqual(["dot"]);
        expect(kinds(explain(".", { ...PLAIN, dotAll: true }))).toEqual(["dotAll"]);
    });

    test("a single character reports its code point; a run does not", () => {
        expect(explain("a")[0].detail).toEqual({ kind: "literalChar", char: "a", code: 97 });
        expect(explain("abc")[0].detail).toEqual({ kind: "literalText", text: "abc" });
    });

    test("the quantifier reads as the first line under its target", () => {
        const [line] = explain(String.raw`[\w]+`);

        expect(line.detail.kind).toBe("characterClass");
        expect(line.children[0].detail.kind).toBe("quantifierOneOrMore");
        expect(line.children[0].greediness).toBe("greedy");
        expect(line.children[1].detail.kind).toBe("shorthandWord");
    });

    test("names every quantifier shape", () => {
        const shapes: readonly [string, ExplanationDetail["kind"]][] = [
            ["a?", "quantifierOptional"],
            ["a*", "quantifierZeroOrMore"],
            ["a+", "quantifierOneOrMore"],
            ["a{3}", "quantifierExactly"],
            ["a{3,}", "quantifierAtLeast"],
            ["a{2,6}", "quantifierBetween"],
        ];

        for (const [pattern, kind] of shapes) {
            expect(explain(pattern)[0].children[0].detail.kind).toBe(kind);
        }
    });

    test("reports greediness", () => {
        expect(explain("a+")[0].children[0].greediness).toBe("greedy");
        expect(explain("a+?")[0].children[0].greediness).toBe("lazy");
        expect(explain("a++")[0].children[0].greediness).toBe("possessive");
    });

    test("counts alternation branches and numbers them", () => {
        const [line] = explain("a|b|c");

        expect(line.detail).toEqual({ kind: "alternation", count: 3 });
        expect(line.children.map((child) => child.detail)).toEqual([
            { kind: "alternationBranch", index: 1 },
            { kind: "alternationBranch", index: 2 },
            { kind: "alternationBranch", index: 3 },
        ]);
    });

    test("numbers capture groups and names named ones", () => {
        const lines = explain("(a)(?<year>b)");

        expect(lines[0].detail).toEqual({ kind: "captureGroup", index: 1 });
        expect(lines[1].detail).toEqual({ kind: "namedGroup", index: 2, name: "year" });
    });

    test("distinguishes the four lookarounds", () => {
        expect(kinds(explain("(?=a)"))).toEqual(["lookahead"]);
        expect(kinds(explain("(?!a)"))).toEqual(["negativeLookahead"]);
        expect(kinds(explain("(?<=a)"))).toEqual(["lookbehind"]);
        expect(kinds(explain("(?<!a)"))).toEqual(["negativeLookbehind"]);
    });

    test("names each shorthand and its negation", () => {
        expect(kinds(explain("\\d"))).toEqual(["shorthandDigit"]);
        expect(kinds(explain("\\D"))).toEqual(["shorthandNonDigit"]);
        expect(kinds(explain("\\w"))).toEqual(["shorthandWord"]);
        expect(kinds(explain("\\W"))).toEqual(["shorthandNonWord"]);
        expect(kinds(explain("\\s"))).toEqual(["shorthandSpace"]);
        expect(kinds(explain("\\S"))).toEqual(["shorthandNonSpace"]);
    });

    test("reads a class range as its two endpoints", () => {
        const [line] = explain("[a-z]");

        expect(line.children[0].detail).toEqual({ kind: "classRange", from: "a", to: "z" });
    });

    test("negated classes and properties are their own kinds", () => {
        expect(kinds(explain("[^a]"))).toEqual(["characterClassNegated"]);
        expect(explain("\\P{L}")[0].detail).toEqual({
            kind: "unicodePropertyNegated",
            property: "L",
        });
    });

    test("control escapes carry their code point", () => {
        expect(explain("\\n")[0].detail).toEqual({
            kind: "controlEscape",
            name: "newline",
            code: 10,
        });
        expect(explain("\\x41")[0].detail).toEqual({
            kind: "codePointEscape",
            char: "A",
            code: 65,
        });
        expect(explain("\\cJ")[0].detail).toEqual({ kind: "controlLetter", letter: "J" });
    });

    test("backreferences carry their target", () => {
        expect(explain("(a)\\1")[1].detail).toEqual({ kind: "backreference", index: 1 });
        expect(explain("(?<n>a)\\k<n>")[1].detail).toEqual({
            kind: "namedBackreference",
            name: "n",
        });
    });

    test("inert whitespace under x earns no line", () => {
        const lines = toExplanation("a b", parsePattern("a b", { extended: true }).root, PLAIN);

        expect(kinds(lines)).toEqual(["literalChar", "literalChar"]);
    });

    test("survives every malformed pattern the parser survives", () => {
        for (const pattern of ["(", "[", "a\\", "*", "(?<", "\\u{", "a)b"]) {
            expect(() => explain(pattern)).not.toThrow();
        }
    });
});
