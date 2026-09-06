import { describe, expect, test } from "bun:test";

import {
    clampOffset,
    collapseAt,
    extendTo,
    isSelected,
    moveCaret,
    selectAll,
    selectRange,
    selectionLength,
    selectionRange,
} from "@/modules/hex-editor/domain/selection";
import type { Selection } from "@/modules/hex-editor/types";

const LENGTH = 100;

function at(offset: number): Selection {
    return { anchor: offset, focus: offset };
}

describe("selectionRange", () => {
    test("covers one byte when nothing is dragged", () => {
        expect(selectionRange(at(5))).toEqual({ start: 5, end: 6 });
        expect(selectionLength(at(5))).toBe(1);
    });

    test("reads the same whichever way the drag went", () => {
        expect(selectionRange({ anchor: 2, focus: 8 })).toEqual({ start: 2, end: 9 });
        expect(selectionRange({ anchor: 8, focus: 2 })).toEqual({ start: 2, end: 9 });
    });

    test("knows which offsets it holds", () => {
        const selection = { anchor: 8, focus: 2 };

        expect(isSelected(selection, 1)).toBe(false);
        expect(isSelected(selection, 2)).toBe(true);
        expect(isSelected(selection, 8)).toBe(true);
        expect(isSelected(selection, 9)).toBe(false);
    });
});

describe("clampOffset", () => {
    test("keeps a caret inside the document", () => {
        expect(clampOffset(-4, LENGTH)).toBe(0);
        expect(clampOffset(500, LENGTH)).toBe(99);
        expect(clampOffset(12, LENGTH)).toBe(12);
    });

    test("answers 0 for an empty document rather than -1", () => {
        expect(clampOffset(3, 0)).toBe(0);
    });
});

describe("collapseAt, extendTo, selectAll, selectRange", () => {
    test("a click collapses the selection where it landed", () => {
        expect(collapseAt(7, LENGTH)).toEqual({ anchor: 7, focus: 7 });
    });

    /** A drag or a Shift+click leaves the anchor exactly where it was. */
    test("an extension keeps the anchor and moves the focus", () => {
        expect(extendTo(at(3), 20, LENGTH)).toEqual({ anchor: 3, focus: 20 });
        expect(extendTo(at(3), 999, LENGTH)).toEqual({ anchor: 3, focus: 99 });
    });

    test("select-all reaches the last byte, not one past it", () => {
        expect(selectAll(LENGTH)).toEqual({ anchor: 0, focus: 99 });
        expect(selectAll(0)).toEqual({ anchor: 0, focus: 0 });
    });

    test("a half-open range becomes an inclusive selection", () => {
        expect(selectRange(4, 8, LENGTH)).toEqual({ anchor: 4, focus: 7 });
        expect(selectionLength(selectRange(4, 8, LENGTH))).toBe(4);
    });
});

describe("moveCaret", () => {
    const context = { length: LENGTH, rowsPerPage: 4, extend: false };

    test("moves one byte sideways and one row vertically", () => {
        expect(moveCaret(at(20), "left", context).focus).toBe(19);
        expect(moveCaret(at(20), "right", context).focus).toBe(21);
        expect(moveCaret(at(20), "up", context).focus).toBe(4);
        expect(moveCaret(at(20), "down", context).focus).toBe(36);
    });

    /** Home and End are the row's ends; Ctrl+Home already has the document. */
    test("Home and End land on the ends of the row", () => {
        expect(moveCaret(at(20), "rowStart", context).focus).toBe(16);
        expect(moveCaret(at(20), "rowEnd", context).focus).toBe(31);
    });

    test("Ctrl+Home and Ctrl+End land on the ends of the document", () => {
        expect(moveCaret(at(20), "documentStart", context).focus).toBe(0);
        expect(moveCaret(at(20), "documentEnd", context).focus).toBe(99);
    });

    test("a page is as many rows as the viewport is showing", () => {
        expect(moveCaret(at(80), "pageUp", context).focus).toBe(80 - 64);
        expect(moveCaret(at(20), "pageDown", context).focus).toBe(84);
    });

    test("never leaves the document", () => {
        expect(moveCaret(at(0), "left", context).focus).toBe(0);
        expect(moveCaret(at(0), "up", context).focus).toBe(0);
        expect(moveCaret(at(99), "right", context).focus).toBe(99);
        expect(moveCaret(at(99), "pageDown", context).focus).toBe(99);
    });

    test("collapses the selection when Shift is not held", () => {
        expect(moveCaret({ anchor: 2, focus: 10 }, "right", context)).toEqual({
            anchor: 11,
            focus: 11,
        });
    });

    test("grows the selection from the anchor when Shift is held", () => {
        expect(moveCaret({ anchor: 2, focus: 10 }, "right", { ...context, extend: true })).toEqual({
            anchor: 2,
            focus: 11,
        });
    });

    test("a page of zero rows still moves a row, rather than standing still", () => {
        expect(moveCaret(at(40), "pageUp", { ...context, rowsPerPage: 0 }).focus).toBe(24);
    });

    test("stays at zero in an empty document", () => {
        expect(moveCaret(at(0), "right", { ...context, length: 0 })).toEqual({
            anchor: 0,
            focus: 0,
        });
    });
});
