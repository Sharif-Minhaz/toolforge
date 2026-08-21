import { describe, expect, test } from "bun:test";

import { runsToText, textCell } from "@/modules/pdf-converter/domain/blocks";
import { toRectangularGrid } from "@/modules/pdf-converter/domain/table-grid";
import type { TableCell } from "@/modules/pdf-converter/types";

function shape(rows: readonly (readonly TableCell[])[]): readonly string[][] {
    return toRectangularGrid(rows).rows.map((row) =>
        row.map((slot) => (slot.kind === "spanned" ? "«span»" : runsToText(slot.cell.runs))),
    );
}

describe("rectangular placement", () => {
    test("pads a short row so every row is the same length", () => {
        expect(shape([[textCell("a"), textCell("b")], [textCell("c")]])).toEqual([
            ["a", "b"],
            ["c", ""],
        ]);
    });

    test("fills the positions a colspan covers", () => {
        expect(
            shape([
                [{ runs: [{ text: "wide" }], colSpan: 2 }, textCell("c")],
                [textCell("1"), textCell("2"), textCell("3")],
            ]),
        ).toEqual([
            ["wide", "«span»", "c"],
            ["1", "2", "3"],
        ]);
    });

    test("a rowspan reserves the slot on the row below", () => {
        // HTML gives the second row one cell, and it belongs in column two.
        expect(
            shape([[{ runs: [{ text: "tall" }], rowSpan: 2 }, textCell("b")], [textCell("c")]]),
        ).toEqual([
            ["tall", "b"],
            ["«span»", "c"],
        ]);
    });

    test("a blank cell arriving at a covered slot is consumed, not pushed sideways", () => {
        // A spreadsheet reader emits a dense grid: the merge's covered
        // positions are already there as blanks. Placing them would shift every
        // column after a merged heading by one.
        expect(
            shape([
                [{ runs: [{ text: "Q1" }], colSpan: 2 }, textCell(""), textCell("Total")],
                [textCell("Jan"), textCell("Feb"), textCell("100")],
            ]),
        ).toEqual([
            ["Q1", "«span»", "Total"],
            ["Jan", "Feb", "100"],
        ]);
    });

    test("a non-blank cell at a covered slot moves right instead of being lost", () => {
        expect(
            shape([
                [{ runs: [{ text: "tall" }], rowSpan: 2 }, textCell("b")],
                [textCell("real"), textCell("next")],
            ]),
        ).toEqual([
            ["tall", "b", ""],
            ["«span»", "real", "next"],
        ]);
    });

    test("an empty table stays empty rather than becoming one blank row", () => {
        expect(toRectangularGrid([]).rows).toEqual([]);
    });
});
