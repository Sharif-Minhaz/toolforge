import { BYTES_PER_ROW } from "./constants";
import { rowForOffset } from "./format";
import type { ByteRange, CaretMove, Selection } from "../types";

/**
 * Where the caret is and what it has hold of.
 *
 * All of it is arithmetic over two numbers, which is the point: the hex column
 * and the ASCII column stay in step because neither owns a selection of its own.
 * They render the same `Selection` and both report clicks in byte offsets, so
 * there is nothing to synchronise.
 */

/** The half-open range a selection covers, whichever way round it was dragged. */
export function selectionRange(selection: Selection): ByteRange {
    const start = Math.min(selection.anchor, selection.focus);
    const end = Math.max(selection.anchor, selection.focus) + 1;

    return { start, end };
}

export function selectionLength(selection: Selection): number {
    const { start, end } = selectionRange(selection);

    return end - start;
}

export function isSelected(selection: Selection, offset: number): boolean {
    const { start, end } = selectionRange(selection);

    return offset >= start && offset < end;
}

/** Keeps a caret inside a document, including the empty one. */
export function clampOffset(offset: number, length: number): number {
    if (length <= 0) {
        return 0;
    }

    return Math.max(0, Math.min(Math.trunc(offset), length - 1));
}

/** A caret with nothing selected. */
export function collapseAt(offset: number, length: number): Selection {
    const clamped = clampOffset(offset, length);

    return { anchor: clamped, focus: clamped };
}

/** A Shift+click or a drag: the anchor stays put and the focus follows. */
export function extendTo(selection: Selection, offset: number, length: number): Selection {
    return { anchor: selection.anchor, focus: clampOffset(offset, length) };
}

export function selectAll(length: number): Selection {
    return { anchor: 0, focus: Math.max(0, length - 1) };
}

export function selectRange(start: number, end: number, length: number): Selection {
    return { anchor: clampOffset(start, length), focus: clampOffset(end - 1, length) };
}

type MoveContext = {
    readonly length: number;
    /** Rows a Page Up or Page Down covers — what the viewport currently shows. */
    readonly rowsPerPage: number;
    /** True while Shift is held: the anchor stays and the selection grows. */
    readonly extend: boolean;
};

/**
 * One keyboard move.
 *
 * Home and End are deliberately the *row's* ends rather than the document's —
 * that is what they do in every editor with a grid in it, and Ctrl+Home already
 * has the whole document. The caller maps the modifier; this function is handed
 * the move it decided on.
 */
export function moveCaret(
    selection: Selection,
    move: CaretMove,
    { length, rowsPerPage, extend }: MoveContext,
): Selection {
    if (length <= 0) {
        return { anchor: 0, focus: 0 };
    }

    const from = selection.focus;
    const page = Math.max(1, rowsPerPage) * BYTES_PER_ROW;
    const rowStart = rowForOffset(from) * BYTES_PER_ROW;

    const target = ((): number => {
        switch (move) {
            case "left":
                return from - 1;
            case "right":
                return from + 1;
            case "up":
                return from - BYTES_PER_ROW;
            case "down":
                return from + BYTES_PER_ROW;
            case "rowStart":
                return rowStart;
            case "rowEnd":
                return rowStart + BYTES_PER_ROW - 1;
            case "pageUp":
                return from - page;
            case "pageDown":
                return from + page;
            case "documentStart":
                return 0;
            case "documentEnd":
                return length - 1;
        }
    })();

    const focus = clampOffset(target, length);

    return extend ? { anchor: selection.anchor, focus } : { anchor: focus, focus };
}
