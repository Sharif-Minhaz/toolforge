import { describe, expect, test } from "bun:test";

import { MAX_SHEETS } from "../domain/constants";
import { nextSelectionAfterRemoval, planIntake, remainingSlots, sheetId } from "../domain/sheets";

describe("remainingSlots", () => {
    test("an empty strip has room for the whole allowance", () => {
        expect(remainingSlots(0)).toBe(MAX_SHEETS);
    });

    test("a full strip has room for none", () => {
        expect(remainingSlots(MAX_SHEETS)).toBe(0);
    });

    test("never reports a negative remainder, however it got overfull", () => {
        expect(remainingSlots(MAX_SHEETS + 3)).toBe(0);
    });
});

describe("planIntake", () => {
    test("takes the whole drop when it fits", () => {
        expect(planIntake(1, 3, 5)).toEqual({ accepted: 3, rejected: 0 });
    });

    test("takes what fits and reports the rest rather than refusing the drop", () => {
        expect(planIntake(3, 4, 5)).toEqual({ accepted: 2, rejected: 2 });
    });

    test("takes nothing once the strip is full, and says how many were turned away", () => {
        expect(planIntake(5, 2, 5)).toEqual({ accepted: 0, rejected: 2 });
    });

    test("an empty drop is not a rejection", () => {
        expect(planIntake(2, 0, 5)).toEqual({ accepted: 0, rejected: 0 });
    });
});

describe("nextSelectionAfterRemoval", () => {
    const ids = ["a", "b", "c", "d"] as const;

    test("closing the open slot moves to its right-hand neighbour", () => {
        expect(nextSelectionAfterRemoval(ids, "b", "b")).toBe("c");
    });

    test("closing the last open slot falls back to the one on its left", () => {
        expect(nextSelectionAfterRemoval(ids, "d", "d")).toBe("c");
    });

    test("closing a slot that is not open leaves the open one open", () => {
        expect(nextSelectionAfterRemoval(ids, "a", "c")).toBe("c");
    });

    test("closing the only slot empties the strip", () => {
        expect(nextSelectionAfterRemoval(["a"], "a", "a")).toBeNull();
    });

    test("a selection that is no longer in the list falls back to the first", () => {
        expect(nextSelectionAfterRemoval(ids, "a", "gone" as "a")).toBe("b");
    });

    test("removing something the list never held changes nothing", () => {
        expect(nextSelectionAfterRemoval(ids, "z" as "a", "c")).toBe("c");
    });
});

describe("sheetId", () => {
    test("is derived from a counter, so two slots never collide", () => {
        expect(sheetId(1)).toBe("sheet-1");
        expect(sheetId(2)).not.toBe(sheetId(1));
    });

    test("is stable for the same sequence number, so a React key survives a re-render", () => {
        expect(sheetId(7)).toBe(sheetId(7));
    });
});
