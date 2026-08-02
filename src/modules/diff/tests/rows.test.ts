import { describe, expect, test } from "bun:test";

import { compareTexts } from "@/modules/diff/domain/compare";
import {
    collapseUnchanged,
    countChangeRuns,
    countCollapsible,
    isChangedRow,
    isChangedUnifiedLine,
    toDiffEntries,
    toUnifiedLines,
} from "@/modules/diff/domain/rows";
import type { DiffOptions, DiffRow } from "@/modules/diff/types";

const PLAIN: DiffOptions = { precision: "line", ignoreCase: false, ignoreWhitespace: false };

function rowsOf(
    left: string,
    right: string,
    options: Partial<DiffOptions> = {},
): readonly DiffRow[] {
    const result = compareTexts(left, right, { ...PLAIN, ...options });

    if (!result.ok) {
        throw new Error(`expected a comparison, got ${result.reason}`);
    }

    return result.rows;
}

/** Twenty identical lines with the eleventh rewritten. */
function longPair(): readonly DiffRow[] {
    const left = Array.from({ length: 20 }, (_, index) => `line ${index}`);
    const right = [...left];
    right[10] = "rewritten";

    return rowsOf(left.join("\n"), right.join("\n"));
}

describe("collapseUnchanged", () => {
    test("keeps the change and the context either side of it", () => {
        const entries = collapseUnchanged(longPair(), isChangedRow, 3);
        const kept = entries.filter((entry) => entry.kind === "item");

        expect(kept).toHaveLength(7);
        expect(entries.filter((entry) => entry.kind === "gap")).toHaveLength(2);
    });

    test("says how many rows each gap stands for", () => {
        const entries = collapseUnchanged(longPair(), isChangedRow, 3);
        const hidden = entries.reduce(
            (total, entry) => (entry.kind === "gap" ? total + entry.hidden : total),
            0,
        );

        expect(hidden).toBe(13);
        expect(hidden).toBe(countCollapsible(longPair(), isChangedRow, 3));
    });

    test("hides nothing when every row is close to a change", () => {
        const rows = rowsOf("a\nb", "x\ny");

        expect(countCollapsible(rows, isChangedRow, 3)).toBe(0);
        expect(collapseUnchanged(rows, isChangedRow, 3).every((e) => e.kind === "item")).toBe(true);
    });

    test("folds a comparison with no changes at all into one gap", () => {
        const rows = rowsOf("a\nb\nc", "a\nb\nc");

        expect(collapseUnchanged(rows, isChangedRow, 3)).toEqual([{ kind: "gap", hidden: 3 }]);
    });
});

describe("toDiffEntries", () => {
    test("leaves every row on screen when folding was not asked for", () => {
        const rows = longPair();
        const entries = toDiffEntries(rows, isChangedRow, null);

        expect(entries).toHaveLength(rows.length);
        expect(entries.every((entry) => entry.kind === "item")).toBe(true);
    });

    test("keeps two identical texts visible rather than folding them entirely", () => {
        // The trap an unlimited context would fall into: with no change to
        // measure from, every row is far from one, so all of them would go.
        const rows = rowsOf("a\nb\nc", "a\nb\nc");

        expect(toDiffEntries(rows, isChangedRow, null)).toHaveLength(3);
    });

    test("folds when a context is given", () => {
        expect(
            toDiffEntries(longPair(), isChangedRow, 3).filter((entry) => entry.kind === "gap"),
        ).toHaveLength(2);
    });
});

describe("countChangeRuns", () => {
    test("counts a block of adjacent changed rows once", () => {
        expect(countChangeRuns(rowsOf("a\nb\nc\nkeep", "x\ny\nz\nkeep"), isChangedRow)).toBe(1);
    });

    test("counts changes that are apart separately", () => {
        const left = Array.from({ length: 12 }, (_, index) => `line ${index}`);
        const right = [...left];
        right[1] = "one";
        right[9] = "two";

        expect(countChangeRuns(rowsOf(left.join("\n"), right.join("\n")), isChangedRow)).toBe(2);
    });

    test("counts nothing when the two texts match", () => {
        expect(countChangeRuns(rowsOf("a\nb", "a\nb"), isChangedRow)).toBe(0);
    });

    test("agrees with itself across the two views", () => {
        const rows = rowsOf("a\nb\nkeep\nc", "x\ny\nkeep\nz");

        // The step buttons number runs the same way in both layouts, so a
        // "change 2 of 3" cannot mean different things depending on the view.
        expect(countChangeRuns(toUnifiedLines(rows), isChangedUnifiedLine)).toBe(
            countChangeRuns(rows, isChangedRow),
        );
    });
});

describe("toUnifiedLines", () => {
    test("prints every removal of a block before any of its additions", () => {
        const lines = toUnifiedLines(rowsOf("a\nb\nkeep", "x\ny\nkeep"));

        expect(lines.map((line) => line.kind)).toEqual(["remove", "remove", "add", "add", "equal"]);
        expect(lines.map((line) => line.text)).toEqual(["a", "b", "x", "y", "keep"]);
    });

    test("numbers a removal on the left only and an addition on the right only", () => {
        const lines = toUnifiedLines(rowsOf("a\nkeep", "b\nkeep"));

        expect(lines[0]).toMatchObject({ kind: "remove", leftNumber: 1, rightNumber: null });
        expect(lines[1]).toMatchObject({ kind: "add", leftNumber: null, rightNumber: 1 });
        expect(lines[2]).toMatchObject({ kind: "equal", leftNumber: 2, rightNumber: 2 });
    });

    test("prints context from the original and flags a folded difference", () => {
        const lines = toUnifiedLines(rowsOf("Alpha", "alpha", { ignoreCase: true }));

        expect(lines[0].text).toBe("Alpha");
        expect(lines[0].ignoredDifference).toBe(true);
        expect(isChangedUnifiedLine(lines[0])).toBe(false);
    });

    test("carries the intra-line highlight onto the side it belongs to", () => {
        const lines = toUnifiedLines(rowsOf("a b", "a c", { precision: "word" }));

        expect(lines[0].segments).toEqual([
            { kind: "equal", text: "a " },
            { kind: "removed", text: "b" },
        ]);
        expect(lines[1].segments).toEqual([
            { kind: "equal", text: "a " },
            { kind: "added", text: "c" },
        ]);
    });
});
