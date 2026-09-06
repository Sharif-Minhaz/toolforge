"use client";

import { create } from "zustand";

import {
    BYTES_PER_ROW,
    DEFAULT_COLUMN,
    DEFAULT_ENDIANNESS,
    DEFAULT_SEARCH_MODE,
} from "../domain/constants";
import { HexDocument } from "../domain/hex-document";
import {
    canRedo,
    canUndo,
    EMPTY_HISTORY,
    recordStep,
    redo,
    reverseStep,
    undo,
} from "../domain/history";
import { findMatches, nextMatch, parseSearchQuery, previousMatch } from "../domain/search";
import {
    clampOffset,
    collapseAt,
    extendTo,
    moveCaret,
    selectAll,
    selectionRange,
} from "../domain/selection";
import type {
    ByteEdit,
    CaretMove,
    EditHistory,
    Endianness,
    HexColumn,
    SearchFailureReason,
    SearchMode,
    Selection,
} from "../types";

/**
 * Everything the editor knows, and nothing about how it looks.
 *
 * Zustand with selector subscriptions rather than React context, for the reason
 * the Mock Server studio uses it: a context provider re-renders every consumer
 * on every change, and this store changes on every arrow key while forty rows
 * are subscribed to it. The rows subscribe to the handful of primitives they
 * render and skip the rest.
 *
 * `HexDocument` is mutable — it has to be, or a keystroke would copy half a
 * gigabyte — so it cannot be the thing a selector compares. `revision` is: every
 * write bumps it, and anything showing bytes reads it alongside them. That is
 * the one place this store departs from being a plain value, and it is why
 * `document` is never handed to a memo without `revision` beside it.
 *
 * Every operation delegates to a pure function in `domain/`. What lives here is
 * which byte the caret is on, which nibble is half-typed, and what the last
 * search found.
 */

/** A half-typed byte: the high nibble is on screen, the low one is not typed. */
export type PendingNibble = {
    readonly offset: number;
    readonly high: number;
};

/** What a search run reports back to the dialog that asked for it. */
export type SearchOutcome =
    | { readonly ok: true; readonly count: number; readonly truncated: boolean }
    | { readonly ok: false; readonly reason: SearchFailureReason };

export type HexState = {
    document: HexDocument | null;
    /**
     * The bytes as opened, kept so Reload can rebuild the document without
     * reading the file again. `HexDocument` never writes to the array it was
     * given, so this is a reference rather than a copy.
     */
    source: Uint8Array | null;
    fileName: string | null;
    /** Bumped by every byte written, because the document itself is mutable. */
    revision: number;

    selection: Selection;
    column: HexColumn;
    endian: Endianness;
    pendingNibble: PendingNibble | null;
    history: EditHistory;

    searchQuery: string;
    searchMode: SearchMode;
    matches: readonly number[];
    matchLength: number;
    matchesTruncated: boolean;

    /** Reported by the grid, so Page Up moves by what is actually on screen. */
    rowsPerPage: number;
    /**
     * A request for the grid to scroll somewhere, with a nonce so that asking
     * twice for the same offset still scrolls. The grid reads it and moves a DOM
     * node; nothing here is cleared afterwards, which is what keeps the effect
     * that does it free of a state write.
     */
    scrollTarget: { offset: number; nonce: number } | null;
    /**
     * Counts scroll requests, and nothing else. It used to be `revision + 1`,
     * which collided the moment two requests were made without a byte changing
     * between them — a fullscreen toggle followed by an arrow key — and a
     * repeated nonce is a scroll the grid never performs.
     */
    scrollNonce: number;

    openFile: (bytes: Uint8Array, name: string) => void;
    closeFile: () => void;
    reloadFile: () => void;
    /** Rebases on what was written to disk, so the document is clean again. */
    markSaved: (bytes: Uint8Array, name: string) => void;

    setCaret: (offset: number, extend: boolean) => void;
    moveBy: (move: CaretMove, extend: boolean) => void;
    selectEverything: () => void;
    setColumn: (column: HexColumn) => void;
    setEndian: (endian: Endianness) => void;

    typeHexDigit: (digit: number) => void;
    typeAscii: (charCode: number) => void;
    clearSelectedBytes: () => void;
    backspace: () => void;
    undoEdit: () => void;
    redoEdit: () => void;

    setSearchQuery: (query: string) => void;
    setSearchMode: (mode: SearchMode) => void;
    runSearch: () => SearchOutcome;
    clearSearch: () => void;
    goToAdjacentMatch: (direction: "next" | "previous") => void;
    goToOffset: (offset: number) => void;
    /**
     * Bring an offset back into view without touching the selection. Full
     * screen moves the grid into a dialog, which mounts a fresh scroller at the
     * top of the file; this is what puts the caret's row back on screen.
     */
    requestScroll: (offset: number) => void;

    setRowsPerPage: (rows: number) => void;
};

const EMPTY_SELECTION: Selection = { anchor: 0, focus: 0 };

export const useHexStore = create<HexState>()((set, get) => ({
    document: null,
    source: null,
    fileName: null,
    revision: 0,

    selection: EMPTY_SELECTION,
    column: DEFAULT_COLUMN,
    endian: DEFAULT_ENDIANNESS,
    pendingNibble: null,
    history: EMPTY_HISTORY,

    searchQuery: "",
    searchMode: DEFAULT_SEARCH_MODE,
    matches: [],
    matchLength: 0,
    matchesTruncated: false,

    rowsPerPage: 20,
    scrollTarget: null,
    scrollNonce: 0,

    openFile: (bytes, name) =>
        set((state) => ({
            document: new HexDocument(bytes, name),
            source: bytes,
            fileName: name,
            revision: state.revision + 1,
            selection: EMPTY_SELECTION,
            pendingNibble: null,
            history: EMPTY_HISTORY,
            matches: [],
            matchLength: 0,
            matchesTruncated: false,
            ...scrollRequest(state, 0),
        })),

    closeFile: () =>
        set((state) => ({
            document: null,
            source: null,
            fileName: null,
            revision: state.revision + 1,
            selection: EMPTY_SELECTION,
            pendingNibble: null,
            history: EMPTY_HISTORY,
            matches: [],
            matchLength: 0,
            matchesTruncated: false,
        })),

    reloadFile: () => {
        const { source, fileName } = get();

        if (source === null || fileName === null) {
            return;
        }

        get().openFile(source, fileName);
    },

    markSaved: (bytes, name) =>
        set((state) => ({
            document: new HexDocument(bytes, name),
            source: bytes,
            fileName: name,
            revision: state.revision + 1,
            pendingNibble: null,
            // Cleared rather than kept: the undo stack's "previous" values now
            // describe a file that no longer exists anywhere, and an undo that
            // silently re-dirties a document somebody just saved is worse than
            // no undo at all.
            history: EMPTY_HISTORY,
        })),

    setCaret: (offset, extend) =>
        set((state) => {
            const length = state.document?.length ?? 0;

            return {
                selection: extend
                    ? extendTo(state.selection, offset, length)
                    : collapseAt(offset, length),
                pendingNibble: null,
            };
        }),

    moveBy: (move, extend) =>
        set((state) => {
            const length = state.document?.length ?? 0;
            const selection = moveCaret(state.selection, move, {
                length,
                rowsPerPage: state.rowsPerPage,
                extend,
            });

            return {
                selection,
                pendingNibble: null,
                ...scrollRequest(state, selection.focus),
            };
        }),

    selectEverything: () =>
        set((state) => ({
            selection: selectAll(state.document?.length ?? 0),
            pendingNibble: null,
        })),

    // Switching column throws the half-typed nibble away: `A_` means nothing in
    // the ASCII column, and carrying it across would write a byte the reader
    // never finished asking for.
    setColumn: (column) => set({ column, pendingNibble: null }),

    setEndian: (endian) => set({ endian }),

    typeHexDigit: (digit) => {
        const state = get();
        const { document, selection, pendingNibble } = state;

        if (document === null || document.length === 0) {
            return;
        }

        const offset = selection.focus;

        if (pendingNibble === null || pendingNibble.offset !== offset) {
            set({ pendingNibble: { offset, high: digit } });

            return;
        }

        writeBytes(set, get, [{ offset, value: (pendingNibble.high << 4) | digit }]);
        set({ pendingNibble: null });
        advanceCaret(set, get);
    },

    typeAscii: (charCode) => {
        const { document, selection } = get();

        if (document === null || document.length === 0 || charCode > 0xff) {
            return;
        }

        writeBytes(set, get, [{ offset: selection.focus, value: charCode }]);
        set({ pendingNibble: null });
        advanceCaret(set, get);
    },

    /** Delete zeroes the whole selection, in one undoable step. */
    clearSelectedBytes: () => {
        const { document, selection } = get();

        if (document === null || document.length === 0) {
            return;
        }

        const { start, end } = selectionRange(selection);
        const writes = Array.from(
            { length: Math.min(end, document.length) - start },
            (_, index) => ({
                offset: start + index,
                value: 0,
            }),
        );

        writeBytes(set, get, writes);
        set({ pendingNibble: null });
    },

    /**
     * Backspace abandons a half-typed byte first, which is what a reader who
     * mistyped one digit is reaching for. With nothing pending it zeroes the
     * byte *before* the caret and steps back onto it — there is no such thing as
     * removing a byte here, because the file's length is fixed.
     */
    backspace: () => {
        const state = get();

        if (state.pendingNibble !== null) {
            set({ pendingNibble: null });

            return;
        }

        const { document, selection } = state;

        if (document === null || selection.focus === 0) {
            return;
        }

        const offset = selection.focus - 1;

        writeBytes(set, get, [{ offset, value: 0 }]);
        set((current) => ({
            selection: collapseAt(offset, current.document?.length ?? 0),
            ...scrollRequest(current, offset),
        }));
    },

    undoEdit: () => {
        const state = get();
        const stepped = undo(state.history);

        if (stepped === null || state.document === null) {
            return;
        }

        applyStep(state.document, reverseStep(stepped.step));

        set((current) => ({
            history: stepped.history,
            revision: current.revision + 1,
            pendingNibble: null,
            selection: collapseAt(stepped.step[0].offset, current.document?.length ?? 0),
            ...scrollRequest(current, stepped.step[0].offset),
        }));
    },

    redoEdit: () => {
        const state = get();
        const stepped = redo(state.history);

        if (stepped === null || state.document === null) {
            return;
        }

        applyStep(state.document, stepped.step);

        set((current) => ({
            history: stepped.history,
            revision: current.revision + 1,
            pendingNibble: null,
            selection: collapseAt(stepped.step[0].offset, current.document?.length ?? 0),
            ...scrollRequest(current, stepped.step[0].offset),
        }));
    },

    setSearchQuery: (searchQuery) => set({ searchQuery }),

    setSearchMode: (searchMode) => set({ searchMode }),

    /**
     * Run on a press rather than on every keystroke.
     *
     * This is the one input on the page that is deliberately not debounced: a
     * scan is linear in the file, and a 300 ms debounce over half a gigabyte
     * still means a scan per pause. A press is a decision, and the answer is
     * worth waiting for once.
     */
    runSearch: () => {
        const { document, searchQuery, searchMode, selection } = get();

        if (document === null) {
            return { ok: false, reason: "empty_query" } as const;
        }

        const parsed = parseSearchQuery(searchQuery, searchMode);

        if (!parsed.ok) {
            set({ matches: [], matchLength: 0, matchesTruncated: false });

            return { ok: false, reason: parsed.reason } as const;
        }

        const found = findMatches(
            (offset) => document.getByte(offset),
            document.length,
            parsed.bytes,
        );

        set((state) => ({
            matches: found.offsets,
            matchLength: parsed.bytes.length,
            matchesTruncated: found.truncated,
            revision: state.revision + 1,
        }));

        // Jumping to the match at or after the caret rather than to the first
        // one, so re-running a search from halfway down a file does not throw
        // the reader back to the top.
        const landing =
            found.offsets.find((offset) => offset >= selection.focus) ?? found.offsets[0];

        if (landing !== undefined) {
            get().goToOffset(landing);
        }

        return { ok: true, count: found.offsets.length, truncated: found.truncated } as const;
    },

    clearSearch: () => set({ matches: [], matchLength: 0, matchesTruncated: false }),

    goToAdjacentMatch: (direction) => {
        const { matches, selection } = get();
        const target =
            direction === "next"
                ? nextMatch(matches, selection.focus)
                : previousMatch(matches, selection.focus);

        if (target !== null) {
            get().goToOffset(target);
        }
    },

    goToOffset: (offset) =>
        set((state) => {
            const clamped = clampOffset(offset, state.document?.length ?? 0);

            return {
                selection: collapseAt(clamped, state.document?.length ?? 0),
                pendingNibble: null,
                ...scrollRequest(state, clamped),
                revision: state.revision + 1,
            };
        }),

    requestScroll: (offset) =>
        set((state) => scrollRequest(state, clampOffset(offset, state.document?.length ?? 0))),

    setRowsPerPage: (rows) => set({ rowsPerPage: Math.max(1, rows) }),
}));

/**
 * A scroll request and the counter that makes asking twice ask twice.
 *
 * Spread into whatever partial the caller is already returning, so the nonce
 * and the target can never be written apart from one another.
 */
function scrollRequest(
    state: HexState,
    offset: number,
): Pick<HexState, "scrollTarget" | "scrollNonce"> {
    const nonce = state.scrollNonce + 1;

    return { scrollTarget: { offset, nonce }, scrollNonce: nonce };
}

type Write = { readonly offset: number; readonly value: number };

/** Applies writes to the document and records whatever actually changed. */
function writeBytes(
    set: (partial: Partial<HexState> | ((state: HexState) => Partial<HexState>)) => void,
    get: () => HexState,
    writes: readonly Write[],
): void {
    const { document } = get();

    if (document === null) {
        return;
    }

    const step: ByteEdit[] = [];

    for (const write of writes) {
        if (write.offset < 0 || write.offset >= document.length) {
            continue;
        }

        const edit = document.setByte(write.offset, write.value);

        if (edit !== null) {
            step.push(edit);
        }
    }

    set((state) => ({
        revision: state.revision + 1,
        history: recordStep(state.history, step),
    }));
}

function applyStep(document: HexDocument, step: readonly ByteEdit[]): void {
    for (const edit of step) {
        document.applyEdit(edit);
    }
}

/** After a byte is written the caret steps on, stopping at the last byte. */
function advanceCaret(
    set: (partial: Partial<HexState> | ((state: HexState) => Partial<HexState>)) => void,
    get: () => HexState,
): void {
    const { document, selection } = get();
    const length = document?.length ?? 0;
    const offset = clampOffset(selection.focus + 1, length);

    set((state) => ({
        selection: collapseAt(offset, length),
        ...scrollRequest(state, offset),
        revision: state.revision + 1,
    }));
}

/** The row a caret sits on, for the grid and the status bar alike. */
export function caretRow(offset: number): number {
    return Math.floor(offset / BYTES_PER_ROW);
}

export const selectCanUndo = (state: HexState) => canUndo(state.history);
export const selectCanRedo = (state: HexState) => canRedo(state.history);
export const selectIsDirty = (state: HexState) => state.document?.dirty ?? false;
