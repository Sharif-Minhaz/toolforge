import { MAX_SPACER_HEIGHT, OVERSCAN_ROWS, ROW_HEIGHT } from "./constants";
import type { RowWindow } from "../types";

/**
 * Which rows the grid builds, given where the scrollbar is.
 *
 * Pure arithmetic rather than a virtualisation library, for two reasons. The
 * first is that every row here is exactly `ROW_HEIGHT` tall — no measurement, no
 * cache, no resize observer — which is the case a general virtualiser spends
 * most of its code not being able to assume. The second is the ceiling: a
 * browser clamps an element at roughly 33.5 million pixels, and a 512 MiB file
 * wants a spacer twenty times that. Handling the clamp means owning the mapping
 * from scroll position to row, which is exactly what a virtualiser owns.
 *
 * So both regimes live in one function and one test file:
 *
 * - **Under the ceiling** the spacer is the true height and `startRow` is a
 *   division. Scrolling is exact, pixel for row.
 * - **Over it** the spacer stops at `MAX_SPACER_HEIGHT` and the scroll position
 *   is mapped onto the row range by ratio. One notch of the wheel is then worth
 *   more than one row, and the rendered block is pinned to the top of the
 *   viewport rather than to a row boundary. Go To and the keyboard still land on
 *   an exact byte.
 */

type WindowInput = {
    readonly totalRows: number;
    readonly viewportHeight: number;
    readonly scrollTop: number;
    readonly rowHeight?: number;
    readonly overscan?: number;
};

export function computeRowWindow({
    totalRows,
    viewportHeight,
    scrollTop,
    rowHeight = ROW_HEIGHT,
    overscan = OVERSCAN_ROWS,
}: WindowInput): RowWindow {
    const rows = Math.max(0, Math.trunc(totalRows));

    if (rows === 0) {
        return { startRow: 0, endRow: 0, spacerHeight: 0, offsetTop: 0, scaled: false };
    }

    const naturalHeight = rows * rowHeight;
    const spacerHeight = Math.min(naturalHeight, MAX_SPACER_HEIGHT);
    const scaled = spacerHeight < naturalHeight;

    // How many rows fit, plus the one that is half on screen at each edge.
    const visibleRows = Math.max(1, Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1);
    const maxStartRow = Math.max(0, rows - visibleRows);
    const clampedScroll = Math.max(
        0,
        Math.min(scrollTop, Math.max(0, spacerHeight - viewportHeight)),
    );

    const firstVisibleRow = scaled
        ? Math.round(ratio(clampedScroll, spacerHeight - viewportHeight) * maxStartRow)
        : Math.floor(clampedScroll / rowHeight);

    const startRow = Math.max(0, Math.min(firstVisibleRow, maxStartRow) - overscan);
    const endRow = Math.min(rows, startRow + visibleRows + overscan * 2);

    // Pinned to the scroll position in scaled mode, because the block's rows no
    // longer correspond to a pixel offset in the spacer.
    const offsetTop = scaled ? clampedScroll : startRow * rowHeight;

    return { startRow, endRow, spacerHeight, offsetTop, scaled };
}

/**
 * Where to scroll so a row sits in the middle of the viewport — what Go To and
 * "find next" both want. Returns a position in the *spacer's* coordinates, which
 * in scaled mode are not the document's.
 */
export function scrollTopForRow({
    row,
    totalRows,
    viewportHeight,
    rowHeight = ROW_HEIGHT,
}: {
    readonly row: number;
    readonly totalRows: number;
    readonly viewportHeight: number;
    readonly rowHeight?: number;
}): number {
    const rows = Math.max(1, Math.trunc(totalRows));
    const naturalHeight = rows * rowHeight;
    const spacerHeight = Math.min(naturalHeight, MAX_SPACER_HEIGHT);
    const maxScroll = Math.max(0, spacerHeight - viewportHeight);

    if (spacerHeight < naturalHeight) {
        const visibleRows = Math.max(1, Math.ceil(Math.max(0, viewportHeight) / rowHeight) + 1);
        const maxStartRow = Math.max(1, rows - visibleRows);
        const centred = Math.max(0, row - Math.floor(visibleRows / 2));

        return Math.round(ratio(Math.min(centred, maxStartRow), maxStartRow) * maxScroll);
    }

    const centred = row * rowHeight - Math.max(0, viewportHeight - rowHeight) / 2;

    return Math.max(0, Math.min(Math.round(centred), maxScroll));
}

/** Division that answers `0` rather than `NaN` when there is nowhere to scroll. */
function ratio(value: number, total: number): number {
    return total <= 0 ? 0 : value / total;
}
