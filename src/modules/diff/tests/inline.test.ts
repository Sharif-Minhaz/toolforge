import { describe, expect, test } from "bun:test";

import { inlineSegments, splitTokens } from "@/modules/diff/domain/inline";
import type { DiffCompareFlags, DiffSegment } from "@/modules/diff/types";

const STRICT: DiffCompareFlags = { ignoreCase: false, ignoreWhitespace: false };

function join(segments: readonly DiffSegment[]): string {
    return segments.map((segment) => segment.text).join("");
}

describe("splitTokens", () => {
    test("re-joins into exactly the text it was given", () => {
        const samples = [
            "const total = items.length + 1;",
            "  leading and trailing  ",
            "punctuation, everywhere!",
            "",
            "emoji 🚀 and Bangla বাংলা",
        ];

        for (const sample of samples) {
            expect(splitTokens(sample, "word").join(""), sample).toBe(sample);
            expect(splitTokens(sample, "char").join(""), sample).toBe(sample);
        }
    });

    test("keeps a word whole and punctuation on its own", () => {
        expect(splitTokens("a.b(c)", "word")).toEqual(["a", ".", "b", "(", "c", ")"]);
    });

    test("treats a whitespace run as one token", () => {
        expect(splitTokens("a   b", "word")).toEqual(["a", "   ", "b"]);
    });

    test("counts an emoji as one character, not two code units", () => {
        expect(splitTokens("a🚀b", "char")).toEqual(["a", "🚀", "b"]);
    });
});

describe("inlineSegments", () => {
    test("says nothing at line precision", () => {
        expect(inlineSegments("a", "b", "line", STRICT)).toBeNull();
    });

    test("gives back both lines exactly, whatever it highlighted", () => {
        const pairs: readonly [string, string][] = [
            ["const a = 1;", "const a = 2;"],
            ["  spaced   out", "spaced out  "],
            ["totally different", "nothing alike"],
            ["", "added from nothing"],
            ["removed to nothing", ""],
        ];

        for (const [left, right] of pairs) {
            for (const precision of ["word", "char"] as const) {
                const segments = inlineSegments(left, right, precision, STRICT);

                expect(join(segments?.left ?? []), `${precision}: ${left}`).toBe(left);
                expect(join(segments?.right ?? []), `${precision}: ${right}`).toBe(right);
            }
        }
    });

    test("never marks a removal on the right or an addition on the left", () => {
        const segments = inlineSegments("one two three", "one four three", "word", STRICT);

        expect(segments?.left.every((segment) => segment.kind !== "added")).toBe(true);
        expect(segments?.right.every((segment) => segment.kind !== "removed")).toBe(true);
    });

    test("merges neighbouring runs of the same kind into one segment", () => {
        const segments = inlineSegments("abcd", "axyd", "char", STRICT);

        expect(segments?.left).toEqual([
            { kind: "equal", text: "a" },
            { kind: "removed", text: "bc" },
            { kind: "equal", text: "d" },
        ]);
    });

    test("honours the same ignore options the lines were compared with", () => {
        const segments = inlineSegments("Alpha beta", "alpha gamma", "word", {
            ignoreCase: true,
            ignoreWhitespace: false,
        });

        expect(segments?.left).toEqual([
            { kind: "equal", text: "Alpha " },
            { kind: "removed", text: "beta" },
        ]);
    });

    test("drops back to whole-line highlighting when the pair is too long", () => {
        const left = "a".repeat(400);
        const right = "b".repeat(400);

        expect(inlineSegments(left, right, "char", STRICT, 1_000)).toBeNull();
        expect(inlineSegments(left, right, "char", STRICT, 400 * 400)).not.toBeNull();
    });
});
