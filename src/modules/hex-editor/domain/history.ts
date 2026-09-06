import { MAX_HISTORY_ENTRIES } from "./constants";
import type { ByteEdit, EditHistory, EditStep } from "../types";

/**
 * Undo and redo over byte overwrites.
 *
 * A `ByteEdit` carries both halves — what the byte was and what it became — so
 * undo and redo are the same record read in opposite directions and there is no
 * second stack to keep in step.
 *
 * The unit is a *step* rather than a byte, because one press is not always one
 * byte: Delete over a selected range writes as many zeroes as were selected and
 * has to come back in one press of Ctrl+Z.
 *
 * Everything here is immutable. The store swaps a value rather than mutating
 * one, which is what lets a selector see that the buttons should change state;
 * the document beside it is mutable by necessity and this is not.
 */

export const EMPTY_HISTORY: EditHistory = { past: [], future: [] };

/**
 * A new step clears the redo stack, which is what every editor does: once you
 * have typed over the branch you undid, there is no longer a future to return
 * to. Past the cap the *oldest* step goes — dropping the newest would make the
 * most recent keystroke the one that cannot be taken back.
 *
 * An empty step is not recorded at all. That is the keystroke which typed a
 * byte's existing value back over it, and an undo that restores what is already
 * on screen looks broken.
 */
export function recordStep(history: EditHistory, step: EditStep): EditHistory {
    if (step.length === 0) {
        return history;
    }

    const past = [...history.past, step];

    return {
        past:
            past.length > MAX_HISTORY_ENTRIES
                ? past.slice(past.length - MAX_HISTORY_ENTRIES)
                : past,
        future: [],
    };
}

export function canUndo(history: EditHistory): boolean {
    return history.past.length > 0;
}

export function canRedo(history: EditHistory): boolean {
    return history.future.length > 0;
}

/** The step to reverse, and the stack with it moved across. `null` when empty. */
export function undo(history: EditHistory): { history: EditHistory; step: EditStep } | null {
    const step = history.past.at(-1);

    if (step === undefined) {
        return null;
    }

    return {
        step,
        history: { past: history.past.slice(0, -1), future: [step, ...history.future] },
    };
}

export function redo(history: EditHistory): { history: EditHistory; step: EditStep } | null {
    const [step, ...rest] = history.future;

    if (step === undefined) {
        return null;
    }

    return { step, history: { past: [...history.past, step], future: rest } };
}

/** Undo hands back the step; this is the byte write that reverses one of them. */
export function reverseEdit(edit: ByteEdit): ByteEdit {
    return { offset: edit.offset, previous: edit.next, next: edit.previous };
}

/**
 * The whole step reversed — the edits backwards, each one flipped.
 *
 * The order matters when a step touched the same offset twice, which nothing
 * does today and something will: undoing them forwards would leave the earlier
 * write standing.
 */
export function reverseStep(step: EditStep): EditStep {
    return step.toReversed().map(reverseEdit);
}
