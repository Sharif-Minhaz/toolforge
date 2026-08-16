import { MAX_SHEETS } from "./constants";

/**
 * The rules about the strip along the bottom of the workbench.
 *
 * Every one of them is arithmetic over a list, deliberately: the island holds the
 * decoded bitmaps and the object URLs, and none of that is testable — but *which*
 * slot is selected after a removal, and *how many* of a five-file drop fit, are
 * exactly the parts that get quietly wrong and never show up in a screenshot.
 *
 * Each slot is independent. There is no batch button, no shared options object
 * and no "apply to all": a picture in slot three has its own cut-out, its own
 * background and its own compare position, and pressing anything in slot one
 * cannot touch it. That is a product decision rather than an implementation one,
 * and it is why nothing here folds several slots into a single result.
 */

/** How many more pictures the strip will take. Never negative, whatever it holds. */
export function remainingSlots(held: number, max = MAX_SHEETS): number {
    return Math.max(0, max - Math.max(0, held));
}

export type IntakePlan = {
    /** How many of the dropped files are taken, in the order they arrived. */
    readonly accepted: number;
    /** How many are turned away because the strip is full. */
    readonly rejected: number;
};

/**
 * Splits a drop of several files against the room that is left.
 *
 * Taking the first N and reporting the rest rather than refusing the whole drop:
 * somebody who selects eight pictures at once wants pictures, and handing back
 * five of them plus "three did not fit" is a better answer than none of them plus
 * the same sentence. The count is reported so the copy can say how many were left
 * behind instead of losing them silently.
 */
export function planIntake(held: number, incoming: number, max = MAX_SHEETS): IntakePlan {
    const room = remainingSlots(held, max);
    const accepted = Math.min(Math.max(0, incoming), room);

    return { accepted, rejected: Math.max(0, incoming) - accepted };
}

/**
 * Which slot to show after one is closed.
 *
 * The neighbour to the right, falling back to the one on the left when the last
 * slot goes — which is what every tab strip does, and what the hand expects when
 * it has just pressed a close button that sits above the next thing it will
 * press. Removing a slot that is *not* the open one leaves the open one open,
 * rather than resetting the view to the first.
 *
 * `null` means the strip is now empty and the workbench goes back to its intake
 * state.
 */
export function nextSelectionAfterRemoval<T extends string>(
    ids: readonly T[],
    removed: T,
    selected: T,
): T | null {
    const remaining = ids.filter((id) => id !== removed);

    if (remaining.length === 0) {
        return null;
    }

    if (selected !== removed) {
        // Still present, so nothing moves. A slot closing three tiles away must
        // not pull the reader out of the picture they are working on.
        return remaining.includes(selected) ? selected : remaining[0];
    }

    const index = ids.indexOf(removed);

    // `index` is where the removed slot was, which is where its right-hand
    // neighbour now sits. Past the end means it was the last one.
    return remaining[Math.min(index, remaining.length - 1)];
}

/**
 * A stable, collision-free id for a new slot.
 *
 * A counter rather than `crypto.randomUUID()` or the clock: slot ids end up as
 * React keys, and a value drawn from entropy during render is the hydration bug
 * `docs/hydration-and-platform-pitfalls.md` opens with. The caller keeps the
 * counter in a ref and only ever increments it, so an id is never reused even
 * after the slot holding it is closed.
 */
export function sheetId(sequence: number): string {
    return `sheet-${sequence}`;
}
