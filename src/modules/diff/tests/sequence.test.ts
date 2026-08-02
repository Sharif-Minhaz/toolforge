import { describe, expect, test } from "bun:test";

import { diffSequences } from "@/modules/diff/domain/sequence";
import type { SequenceOp } from "@/modules/diff/types";

const BUDGET = 1_000_000;

type Pair = {
    readonly name: string;
    readonly left: readonly string[];
    readonly right: readonly string[];
};

function ops(left: readonly string[], right: readonly string[]): readonly SequenceOp[] {
    const result = diffSequences(left, right, BUDGET);

    if (!result.ok) {
        throw new Error(`expected a diff, got ${result.reason}`);
    }

    return result.ops;
}

/** Walks the edit script back into the two sequences it claims to describe. */
function reconstruct(
    script: readonly SequenceOp[],
    left: readonly string[],
    right: readonly string[],
) {
    const fromLeft: string[] = [];
    const fromRight: string[] = [];

    for (const op of script) {
        if (op.kind !== "insert") {
            fromLeft.push(left[op.leftIndex]);
        }

        if (op.kind !== "delete") {
            fromRight.push(right[op.rightIndex]);
        }
    }

    return { fromLeft, fromRight };
}

/**
 * A second opinion on how long the common subsequence should be, computed
 * without the rolling row or the backtrack matrix the implementation uses. A
 * script can reconstruct both sides perfectly and still be a bad diff; this is
 * what says it is a minimal one.
 */
function lcsLength(left: readonly string[], right: readonly string[]): number {
    const table: number[][] = Array.from({ length: left.length + 1 }, () =>
        new Array<number>(right.length + 1).fill(0),
    );

    for (let row = 1; row <= left.length; row += 1) {
        for (let column = 1; column <= right.length; column += 1) {
            table[row][column] =
                left[row - 1] === right[column - 1]
                    ? table[row - 1][column - 1] + 1
                    : Math.max(table[row - 1][column], table[row][column - 1]);
        }
    }

    return table[left.length][right.length];
}

/** Deterministic, so a failing case is the same case on the next run. */
function pseudoRandomSequence(seed: number, length: number, alphabet: number): string[] {
    let state = seed;
    const out: string[] = [];

    for (let index = 0; index < length; index += 1) {
        state = (state * 1103515245 + 12345) % 2147483648;
        out.push(String.fromCharCode(97 + (state % alphabet)));
    }

    return out;
}

const PAIRS: readonly Pair[] = [
    { name: "both empty", left: [], right: [] },
    { name: "empty left", left: [], right: ["a", "b"] },
    { name: "empty right", left: ["a", "b"], right: [] },
    { name: "identical", left: ["a", "b", "c"], right: ["a", "b", "c"] },
    { name: "nothing in common", left: ["a", "b"], right: ["x", "y"] },
    { name: "one insertion", left: ["a", "c"], right: ["a", "b", "c"] },
    { name: "one deletion", left: ["a", "b", "c"], right: ["a", "c"] },
    { name: "one replacement", left: ["a", "b", "c"], right: ["a", "x", "c"] },
    { name: "shared prefix only", left: ["a", "b", "c"], right: ["a", "x", "y"] },
    { name: "shared suffix only", left: ["b", "c", "z"], right: ["x", "y", "z"] },
    { name: "repeated values", left: ["a", "a", "a", "b"], right: ["a", "b", "a", "a"] },
    { name: "moved block", left: ["1", "2", "3", "4"], right: ["3", "4", "1", "2"] },
];

describe("diffSequences", () => {
    test("reconstructs both sequences from the edit script", () => {
        for (const pair of PAIRS) {
            const { fromLeft, fromRight } = reconstruct(
                ops(pair.left, pair.right),
                pair.left,
                pair.right,
            );

            expect(fromLeft, pair.name).toEqual([...pair.left]);
            expect(fromRight, pair.name).toEqual([...pair.right]);
        }
    });

    test("emits as many equal ops as the sequences have in common", () => {
        for (const pair of PAIRS) {
            const matched = ops(pair.left, pair.right).filter((op) => op.kind === "equal").length;

            expect(matched, pair.name).toBe(lcsLength(pair.left, pair.right));
        }
    });

    test("stays minimal and lossless on generated sequences", () => {
        for (let seed = 1; seed <= 12; seed += 1) {
            const left = pseudoRandomSequence(seed, 40, 4);
            const right = pseudoRandomSequence(seed * 7 + 3, 45, 4);
            const script = ops(left, right);
            const { fromLeft, fromRight } = reconstruct(script, left, right);

            expect(fromLeft, `seed ${seed}`).toEqual(left);
            expect(fromRight, `seed ${seed}`).toEqual(right);
            expect(script.filter((op) => op.kind === "equal").length, `seed ${seed}`).toBe(
                lcsLength(left, right),
            );
        }
    });

    test("pairs an equal op with the same value on both sides", () => {
        const left = ["a", "b", "c", "d"];
        const right = ["z", "b", "c", "e"];

        for (const op of ops(left, right)) {
            if (op.kind === "equal") {
                expect(left[op.leftIndex]).toBe(right[op.rightIndex]);
            }
        }
    });

    test("keeps every deletion of a rewritten block ahead of its insertions", () => {
        const script = ops(["a", "b", "c"], ["x", "y", "z"]);

        expect(script.map((op) => op.kind)).toEqual([
            "delete",
            "delete",
            "delete",
            "insert",
            "insert",
            "insert",
        ]);
    });

    test("matches shared ends without spending any of the budget on them", () => {
        const shared = Array.from({ length: 400 }, (_, index) => `line ${index}`);
        const left = [...shared, "only left", ...shared];
        const right = [...shared, "only right", ...shared];

        // One differing element on each side is a one-cell table, so this
        // succeeds at a budget that the 801-element sequences never could.
        const result = diffSequences(left, right, 1);

        expect(result.ok).toBe(true);
    });

    test("refuses a middle bigger than the budget instead of allocating it", () => {
        const left = Array.from({ length: 40 }, (_, index) => `l${index}`);
        const right = Array.from({ length: 40 }, (_, index) => `r${index}`);

        expect(diffSequences(left, right, 1599)).toEqual({ ok: false, reason: "too_large" });
        expect(diffSequences(left, right, 1600).ok).toBe(true);
    });
});
