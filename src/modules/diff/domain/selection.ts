/**
 * Turning the cells a selection covered back into the text the reader meant to
 * take.
 *
 * The result table is not only the lines. It carries line numbers, the `-`/`+`
 * signs, the screen-reader labels that name a row's change, the "no line on this
 * side" stand-in and the `≈` ignored marker — and a browser's own copy walks the
 * rendered DOM, so all of it lands in the clipboard:
 *
 *     MCP_IP_SALT=…	No line on this side
 *     RemovedMCP_ACCESS_TOKEN=…
 *
 * The viewer strips the parts that were never content and hands this the text of
 * the content cells alone, row by row. What is left is deciding how one row's
 * cells become one line.
 */

/** The content cells of one selected row, in column order. */
export type SelectedRow = readonly string[];

/**
 * Joins a row's cells the way its columns read: a tab between them, one line per
 * row. Empty cells are dropped rather than left as leading or trailing
 * whitespace — in the split view they are the side that has no line at all, and
 * a run of removals should paste as a run of lines.
 */
export function toSelectionText(rows: readonly SelectedRow[]): string {
    return rows.map(toSelectionLine).join("\n");
}

function toSelectionLine(cells: SelectedRow): string {
    const filled = cells.filter((cell) => cell.length > 0);

    // The split view prints an unchanged line in both columns. The reader
    // selected one line and expects one, so a repeat of the cell beside it
    // collapses. A changed row's two sides differ, so both survive.
    const distinct = filled.filter((cell, index) => index === 0 || cell !== filled[index - 1]);

    return distinct.join("\t");
}
