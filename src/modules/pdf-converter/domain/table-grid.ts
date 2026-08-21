import type { TableCell } from "../types";

/**
 * A table's cells placed onto a rectangle.
 *
 * `pdfmake` will not lay out a ragged table: every row must hold the same
 * number of entries, and a cell that spans has to be followed by an empty
 * object in each position it covers. HTML supplies neither — `<tr>` rows can be
 * different lengths, and a `rowspan` leaves the row below one cell short.
 *
 * So placement happens here, once, over the same occupancy map a browser's own
 * table algorithm keeps: walk the cells in document order, put each one in the
 * first slot not already covered, and mark what it covers.
 *
 * One rule earns its own note. **A blank cell arriving at a covered slot is a
 * placeholder, not content.** A spreadsheet reader knows its merges up front
 * and emits a dense grid with blanks in the covered positions; an HTML reader
 * knows nothing and emits short rows. Consuming the blank rather than pushing
 * it sideways is what lets both arrive here and come out right — without it,
 * every column after a merged heading is shifted one to the right.
 */

/** A position holding a cell, or one covered by a span that started elsewhere. */
export type GridSlot =
    { readonly kind: "cell"; readonly cell: TableCell } | { readonly kind: "spanned" };

export type TableGrid = {
    readonly columnCount: number;
    readonly rows: readonly (readonly GridSlot[])[];
};

const EMPTY_SLOT: GridSlot = { kind: "cell", cell: { runs: [] } };

const SPANNED_SLOT: GridSlot = { kind: "spanned" };

function isBlank(cell: TableCell): boolean {
    return cell.runs.every((run) => run.text.trim().length === 0);
}

export function toRectangularGrid(rows: readonly (readonly TableCell[])[]): TableGrid {
    const placed: (TableCell | undefined)[][] = [];
    const covered: boolean[][] = [];

    const ensureRow = (index: number) => {
        while (placed.length <= index) {
            placed.push([]);
            covered.push([]);
        }
    };

    for (const [rowIndex, row] of rows.entries()) {
        ensureRow(rowIndex);

        let column = 0;

        for (const cell of row) {
            if (covered[rowIndex][column] === true) {
                if (isBlank(cell)) {
                    column += 1;

                    continue;
                }

                while (covered[rowIndex][column] === true) {
                    column += 1;
                }
            }

            const colSpan = Math.max(1, cell.colSpan ?? 1);
            const rowSpan = Math.max(1, cell.rowSpan ?? 1);

            placed[rowIndex][column] = cell;

            for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
                ensureRow(r);

                for (let c = column; c < column + colSpan; c += 1) {
                    if (r !== rowIndex || c !== column) {
                        covered[r][c] = true;
                    }
                }
            }

            // One, not `colSpan`. A dense grid follows a spanning cell with a
            // blank for each position it covers, and those blanks have to meet
            // the covered-slot check above to be consumed. A short HTML row has
            // no such blanks, and its next real cell steps over the span there
            // instead.
            column += 1;
        }
    }

    const columnCount = Math.max(
        1,
        ...placed.map((row) => row.length),
        ...covered.map((row) => row.length),
    );

    return {
        columnCount,
        rows: placed.map((row, rowIndex) =>
            Array.from({ length: columnCount }, (_, column): GridSlot => {
                const cell = row[column];

                if (cell !== undefined) {
                    return { kind: "cell", cell };
                }

                return covered[rowIndex]?.[column] === true ? SPANNED_SLOT : EMPTY_SLOT;
            }),
        ),
    };
}
