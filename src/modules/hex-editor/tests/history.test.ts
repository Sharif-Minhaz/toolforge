import { describe, expect, test } from "bun:test";

import { MAX_HISTORY_ENTRIES } from "@/modules/hex-editor/domain/constants";
import {
    canRedo,
    canUndo,
    EMPTY_HISTORY,
    recordStep,
    redo,
    reverseEdit,
    reverseStep,
    undo,
} from "@/modules/hex-editor/domain/history";
import type { ByteEdit } from "@/modules/hex-editor/types";

function edit(offset: number, previous: number, next: number): ByteEdit {
    return { offset, previous, next };
}

describe("edit history", () => {
    test("starts with nothing to undo or redo", () => {
        expect(canUndo(EMPTY_HISTORY)).toBe(false);
        expect(canRedo(EMPTY_HISTORY)).toBe(false);
        expect(undo(EMPTY_HISTORY)).toBeNull();
        expect(redo(EMPTY_HISTORY)).toBeNull();
    });

    test("undoes the most recent step first", () => {
        let history = recordStep(EMPTY_HISTORY, [edit(0, 1, 2)]);
        history = recordStep(history, [edit(4, 3, 4)]);

        const undone = undo(history);

        expect(undone?.step).toEqual([edit(4, 3, 4)]);
        expect(undone?.history.past).toHaveLength(1);
        expect(canRedo(undone!.history)).toBe(true);
    });

    /** One press of Delete over a range comes back in one press of Ctrl+Z. */
    test("keeps a many-byte step whole", () => {
        const step = [edit(0, 1, 0), edit(1, 2, 0), edit(2, 3, 0)];
        const history = recordStep(EMPTY_HISTORY, step);

        expect(undo(history)?.step).toHaveLength(3);
        expect(history.past).toHaveLength(1);
    });

    test("redoes what was undone, in the order it was undone", () => {
        let history = recordStep(EMPTY_HISTORY, [edit(0, 1, 2)]);
        history = recordStep(history, [edit(4, 3, 4)]);
        history = undo(history)!.history;
        history = undo(history)!.history;

        expect(redo(history)?.step).toEqual([edit(0, 1, 2)]);
    });

    /** Typing over an undone branch discards it, as every editor does. */
    test("a new step clears the redo stack", () => {
        let history = recordStep(EMPTY_HISTORY, [edit(0, 1, 2)]);
        history = undo(history)!.history;

        expect(canRedo(history)).toBe(true);

        history = recordStep(history, [edit(9, 0, 1)]);

        expect(canRedo(history)).toBe(false);
    });

    /** The keystroke that changed nothing must not become an undo step. */
    test("does not record an empty step", () => {
        expect(recordStep(EMPTY_HISTORY, [])).toBe(EMPTY_HISTORY);
    });

    /** The oldest goes, not the newest — the last keystroke stays undoable. */
    test("drops the oldest step past the cap", () => {
        let history = EMPTY_HISTORY;

        for (let index = 0; index < MAX_HISTORY_ENTRIES + 10; index += 1) {
            history = recordStep(history, [edit(index, 0, 1)]);
        }

        expect(history.past).toHaveLength(MAX_HISTORY_ENTRIES);
        expect(history.past[0][0].offset).toBe(10);
        expect(history.past.at(-1)?.[0].offset).toBe(MAX_HISTORY_ENTRIES + 9);
    });

    test("never mutates the history it was handed", () => {
        const history = recordStep(EMPTY_HISTORY, [edit(0, 1, 2)]);

        undo(history);

        expect(history.past).toHaveLength(1);
        expect(EMPTY_HISTORY.past).toHaveLength(0);
    });

    test("reverses an edit by swapping its halves", () => {
        expect(reverseEdit(edit(7, 0x4d, 0xaf))).toEqual(edit(7, 0xaf, 0x4d));
    });

    /** Backwards as well as flipped, so a step that wrote twice unwinds. */
    test("reverses a step backwards", () => {
        expect(reverseStep([edit(0, 1, 2), edit(0, 2, 3)])).toEqual([edit(0, 3, 2), edit(0, 2, 1)]);
    });
});
