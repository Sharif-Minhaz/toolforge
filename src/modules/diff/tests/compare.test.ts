import { describe, expect, test } from "bun:test";

import { compareTexts } from "@/modules/diff/domain/compare";
import { MAX_DIFF_INPUT_LENGTH, MAX_DIFF_LINES } from "@/modules/diff/domain/constants";
import type {
    DiffFailureReason,
    DiffOptions,
    DiffRowType,
    DiffSuccess,
} from "@/modules/diff/types";

const PLAIN: DiffOptions = { precision: "line", ignoreCase: false, ignoreWhitespace: false };

function compare(left: string, right: string, options: Partial<DiffOptions> = {}): DiffSuccess {
    const result = compareTexts(left, right, { ...PLAIN, ...options });

    if (!result.ok) {
        throw new Error(`expected a comparison, got ${result.reason}`);
    }

    return result;
}

function expectFailure(left: string, right: string, reason: DiffFailureReason) {
    const result = compareTexts(left, right, PLAIN);

    expect(result.ok).toBe(false);

    if (!result.ok) {
        expect(result.reason).toBe(reason);
    }
}

function rowTypes(result: DiffSuccess): DiffRowType[] {
    return result.rows.map((row) => row.type);
}

describe("compareTexts", () => {
    test("reports an empty comparison only when both sides are empty", () => {
        expectFailure("", "", "empty");
        expect(compare("", "a").ok).toBe(true);
    });

    test("refuses input longer than the per-side limit", () => {
        expectFailure("a".repeat(MAX_DIFF_INPUT_LENGTH + 1), "a", "too_long");
        expectFailure("a", "a".repeat(MAX_DIFF_INPUT_LENGTH + 1), "too_long");
    });

    test("refuses more lines than the per-side limit", () => {
        const tooMany = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `line ${i}`).join(
            "\n",
        );

        expectFailure(tooMany, "a", "too_many_lines");
    });

    test("refuses a comparison whose table would exceed the cell budget", () => {
        const left = Array.from({ length: 2_001 }, (_, index) => `left ${index}`).join("\n");
        const right = Array.from({ length: 2_001 }, (_, index) => `right ${index}`).join("\n");

        expectFailure(left, right, "too_large");
    });

    test("treats an empty side as no lines rather than one blank line", () => {
        const result = compare("", "a\nb");

        expect(rowTypes(result)).toEqual(["insert", "insert"]);
        expect(result.stats).toEqual({
            added: 2,
            removed: 0,
            changed: 0,
            unchanged: 0,
            ignoredMatches: 0,
        });
    });

    test("pairs a rewritten line into one replace row", () => {
        const result = compare("a\nb\nc", "a\nx\nc");

        expect(rowTypes(result)).toEqual(["equal", "replace", "equal"]);
        expect(result.rows[1].left).toBe("b");
        expect(result.rows[1].right).toBe("x");
        expect(result.rows[1].leftNumber).toBe(2);
        expect(result.rows[1].rightNumber).toBe(2);
        expect(result.identical).toBe(false);
    });

    test("numbers each side independently once they drift apart", () => {
        const result = compare("a\nb\nc", "a\nb\nb2\nc");
        const inserted = result.rows.find((row) => row.type === "insert");

        expect(inserted?.leftNumber).toBeNull();
        expect(inserted?.rightNumber).toBe(3);
        expect(result.rows[result.rows.length - 1].leftNumber).toBe(3);
        expect(result.rows[result.rows.length - 1].rightNumber).toBe(4);
    });

    test("counts additions, removals and rewrites apart from each other", () => {
        const result = compare("keep\ndrop\nedit\ntail", "keep\nedit!\ntail\nadd");

        expect(result.stats).toEqual({
            added: 1,
            removed: 1,
            changed: 1,
            unchanged: 2,
            ignoredMatches: 0,
        });
    });

    test("calls two files identical when only an ignored option separates them", () => {
        const result = compare("Alpha\nBeta", "alpha\nbeta", { ignoreCase: true });

        expect(result.identical).toBe(true);
        expect(rowTypes(result)).toEqual(["equal", "equal"]);
        expect(result.stats.ignoredMatches).toBe(2);
        expect(result.rows[0].ignoredDifference).toBe(true);
        // The raw text is what is displayed; only the comparison was folded.
        expect(result.rows[0].left).toBe("Alpha");
        expect(result.rows[0].right).toBe("alpha");
    });

    test("keeps case differences when the option is off", () => {
        const result = compare("Alpha", "alpha");

        expect(rowTypes(result)).toEqual(["replace"]);
        expect(result.stats.ignoredMatches).toBe(0);
    });

    test("folds whitespace runs and trims the ends when asked to", () => {
        const result = compare("  a\tb  ", "a b", { ignoreWhitespace: true });

        expect(result.identical).toBe(true);
        expect(result.rows[0].ignoredDifference).toBe(true);
    });

    test("leaves inline segments off at line precision", () => {
        expect(compare("a b c", "a x c").rows[0].segments).toBeNull();
    });

    test("marks only the changed token at word precision", () => {
        const segments = compare("a b c", "a x c", { precision: "word" }).rows[0].segments;

        expect(segments?.left).toEqual([
            { kind: "equal", text: "a " },
            { kind: "removed", text: "b" },
            { kind: "equal", text: " c" },
        ]);
        expect(segments?.right).toEqual([
            { kind: "equal", text: "a " },
            { kind: "added", text: "x" },
            { kind: "equal", text: " c" },
        ]);
    });

    test("splits on whichever line ending the pasted text uses", () => {
        expect(rowTypes(compare("a\r\nb", "a\nb"))).toEqual(["equal", "equal"]);
    });
});
