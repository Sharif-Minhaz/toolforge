import { describe, expect, test } from "bun:test";

import {
    MAX_SPACER_HEIGHT,
    OVERSCAN_ROWS,
    ROW_HEIGHT,
} from "@/modules/hex-editor/domain/constants";
import { computeRowWindow, scrollTopForRow } from "@/modules/hex-editor/domain/window";

const VIEWPORT = 440;

describe("computeRowWindow, under the spacer ceiling", () => {
    test("renders the top of the document at rest", () => {
        const window = computeRowWindow({
            totalRows: 1000,
            viewportHeight: VIEWPORT,
            scrollTop: 0,
        });

        expect(window.scaled).toBe(false);
        expect(window.startRow).toBe(0);
        expect(window.offsetTop).toBe(0);
        expect(window.spacerHeight).toBe(1000 * ROW_HEIGHT);
    });

    test("divides the scroll position by the row height", () => {
        const window = computeRowWindow({
            totalRows: 1000,
            viewportHeight: VIEWPORT,
            scrollTop: 100 * ROW_HEIGHT,
        });

        expect(window.startRow).toBe(100 - OVERSCAN_ROWS);
        expect(window.offsetTop).toBe(window.startRow * ROW_HEIGHT);
    });

    test("renders enough rows to cover the viewport, plus the overscan", () => {
        const window = computeRowWindow({
            totalRows: 1000,
            viewportHeight: VIEWPORT,
            scrollTop: 5000,
        });
        const visible = Math.ceil(VIEWPORT / ROW_HEIGHT) + 1;

        expect(window.endRow - window.startRow).toBe(visible + OVERSCAN_ROWS * 2);
    });

    test("never renders past the last row", () => {
        const window = computeRowWindow({
            totalRows: 30,
            viewportHeight: VIEWPORT,
            scrollTop: 999_999,
        });

        expect(window.endRow).toBe(30);
        expect(window.startRow).toBeGreaterThanOrEqual(0);
    });

    test("renders nothing for a document with no rows", () => {
        expect(computeRowWindow({ totalRows: 0, viewportHeight: VIEWPORT, scrollTop: 0 })).toEqual({
            startRow: 0,
            endRow: 0,
            spacerHeight: 0,
            offsetTop: 0,
            scaled: false,
        });
    });
});

describe("computeRowWindow, over the spacer ceiling", () => {
    // A 512 MiB file: 33.5 million rows, which wants a spacer twenty times
    // taller than a browser will render.
    const HUGE_ROWS = 33_554_432;

    test("caps the spacer and says that it did", () => {
        const window = computeRowWindow({
            totalRows: HUGE_ROWS,
            viewportHeight: VIEWPORT,
            scrollTop: 0,
        });

        expect(window.scaled).toBe(true);
        expect(window.spacerHeight).toBe(MAX_SPACER_HEIGHT);
    });

    /**
     * The bug this exists to catch: with a clamped spacer and a naive division,
     * the scrollbar reaches the bottom while the grid is a twentieth of the way
     * into the file, and the last thirty million rows are unreachable.
     */
    test("reaches the last row at the bottom of the scrollbar", () => {
        const window = computeRowWindow({
            totalRows: HUGE_ROWS,
            viewportHeight: VIEWPORT,
            scrollTop: MAX_SPACER_HEIGHT - VIEWPORT,
        });

        expect(window.endRow).toBe(HUGE_ROWS);
    });

    test("lands in the middle of the file half way down the scrollbar", () => {
        const window = computeRowWindow({
            totalRows: HUGE_ROWS,
            viewportHeight: VIEWPORT,
            scrollTop: (MAX_SPACER_HEIGHT - VIEWPORT) / 2,
        });

        expect(window.startRow).toBeGreaterThan(HUGE_ROWS * 0.49);
        expect(window.startRow).toBeLessThan(HUGE_ROWS * 0.51);
    });

    test("pins the rendered block to the scroll position", () => {
        const window = computeRowWindow({
            totalRows: HUGE_ROWS,
            viewportHeight: VIEWPORT,
            scrollTop: 1_000_000,
        });

        expect(window.offsetTop).toBe(1_000_000);
    });
});

describe("scrollTopForRow", () => {
    test("centres the row in the viewport", () => {
        const top = scrollTopForRow({ row: 500, totalRows: 1000, viewportHeight: VIEWPORT });
        const window = computeRowWindow({
            totalRows: 1000,
            viewportHeight: VIEWPORT,
            scrollTop: top,
        });

        expect(window.startRow).toBeLessThanOrEqual(500);
        expect(window.endRow).toBeGreaterThan(500);
    });

    test("never scrolls above the top or past the bottom", () => {
        expect(scrollTopForRow({ row: 0, totalRows: 1000, viewportHeight: VIEWPORT })).toBe(0);
        expect(
            scrollTopForRow({ row: 999, totalRows: 1000, viewportHeight: VIEWPORT }),
        ).toBeLessThanOrEqual(1000 * ROW_HEIGHT - VIEWPORT);
    });

    /** Go To has to land on an exact row in the scaled regime too. */
    test("brings a far-off row into the window of a scaled document", () => {
        const totalRows = 33_554_432;
        const row = 30_000_000;
        const top = scrollTopForRow({ row, totalRows, viewportHeight: VIEWPORT });
        const window = computeRowWindow({ totalRows, viewportHeight: VIEWPORT, scrollTop: top });

        expect(window.startRow).toBeLessThanOrEqual(row);
        expect(window.endRow).toBeGreaterThan(row);
    });
});
